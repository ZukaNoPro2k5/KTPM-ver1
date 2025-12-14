// Controller quan ly bookings va payments
import { Request, Response } from 'express';
import connection from '../database/database';
import { CreateBookingRequest, ProcessPaymentRequest } from '../types/booking';
import axios from 'axios';

export class BookingController {
  private userServiceUrl = process.env.USER_SERVICE_URL || 'http://localhost:5001';
  private flightServiceUrl = process.env.FLIGHT_SERVICE_URL || 'http://localhost:5002';

  // Tao booking - goi User Service va Flight Service
  async createBooking(req: Request, res: Response): Promise<void> {
    const bookingData: CreateBookingRequest = req.body;

    if (!bookingData.userID || !bookingData.flightID) {
      res.status(400).json({ message: 'Missing required fields' });
      return;
    }

    try {
      // Verify user exists via User Service
      const userResponse = await axios.get(`${this.userServiceUrl}/api/users/${bookingData.userID}`);

      if (!userResponse.data) {
        res.status(404).json({ message: 'User not found' });
        return;
      }

      // Verify flight exists and has seats via Flight Service
      const flightResponse = await axios.get(`${this.flightServiceUrl}/api/Flights/${bookingData.flightID}`);

      if (!flightResponse.data) {
        res.status(404).json({ message: 'Flight not found' });
        return;
      }

      if (flightResponse.data.SeatsAvailable <= 0) {
        res.status(400).json({ message: 'No seats available' });
        return;
      }

      // Create booking
      const query = 'INSERT INTO Bookings (UserID, FlightID, BookingStatus, PaymentStatus) VALUES (?, ?, ?, ?)';

      connection.execute(
        query,
        [bookingData.userID, bookingData.flightID, 'pending', 'unpaid'],
        async (err, result: any) => {
          if (err) {
            console.error('Error creating booking:', err);
            res.status(500).json({ message: 'Error creating booking', error: err.message });
            return;
          }

          const bookingId = result.insertId;

          // Reserve seat via Flight Service
          try {
            await axios.post(`${this.flightServiceUrl}/api/Flights/${bookingData.flightID}/reserve-seat`);

            res.status(201).json({
              message: 'Booking created successfully',
              bookingId
            });
          } catch (reserveError: any) {
            console.error('Error reserving seat:', reserveError.message);

            // Compensating transaction: Delete booking if reserve seat fails
            connection.execute('DELETE FROM Bookings WHERE BookingID = ?', [bookingId], (deleteErr) => {
              if (deleteErr) {
                console.error('Error rolling back booking:', deleteErr);
              }
            });

            res.status(500).json({ message: 'Error reserving seat, booking cancelled' });
          }
        }
      );

    } catch (error: any) {
      console.error('Service communication error:', error.message);
      res.status(500).json({
        message: 'Error communicating with other services',
        error: error.message
      });
    }
  }

  // Lay tat ca bookings (Admin only - dung de quan ly)
  getAllBookings(req: Request, res: Response): void {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const countQuery = 'SELECT COUNT(*) as total FROM Bookings';

    connection.query(countQuery, (countErr: any, countResults: any) => {
      if (countErr) {
        console.error('Error counting bookings:', countErr);
        return res.status(500).json({ message: 'Internal Server Error' });
      }

      const totalItems = countResults[0].total;
      const totalPages = Math.ceil(totalItems / limit);

      const query = 'SELECT * FROM Bookings LIMIT ? OFFSET ?';

      connection.query(query, [limit, offset], (err: any, results) => {
        if (err) {
          console.error('Error executing query:', err.stack);
          res.status(500).json({ message: 'Internal Server Error', error: err.message });
          return;
        }

        if ((results as any).length === 0) {
          res.status(404).json({ message: 'No bookings found' });
          return;
        }

        res.status(200).json({
          data: results,
          pagination: {
            totalItems,
            totalPages,
            currentPage: page,
            itemsPerPage: limit
          }
        });
      });
    });
  }

  // Lay bookings cua 1 user cu the (User xem bookings cua minh)
  getUserBookings(req: Request, res: Response): void {
    const { userId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    if (!userId) {
      res.status(400).json({ message: 'Missing user ID' });
      return;
    }

    const countQuery = 'SELECT COUNT(*) as total FROM Bookings WHERE UserID = ?';

    connection.execute(countQuery, [userId], (countErr: any, countResults: any) => {
      if (countErr) {
        console.error('Error counting user bookings:', countErr);
        return res.status(500).json({ message: 'Internal Server Error' });
      }

      const totalItems = countResults[0].total;
      const totalPages = Math.ceil(totalItems / limit);

      const query = 'SELECT * FROM Bookings WHERE UserID = ? LIMIT ? OFFSET ?';
      connection.execute(query, [userId, limit, offset], (err: any, results) => {
        if (err) {
          console.error('Error fetching user bookings:', err);
          res.status(500).json({ message: 'Error fetching bookings', error: err.message });
          return;
        }

        if ((results as any).length === 0) {
          res.status(404).json({ message: 'No bookings found for this user' });
          return;
        }

        res.status(200).json({
          data: results,
          pagination: {
            totalItems,
            totalPages,
            currentPage: page,
            itemsPerPage: limit
          }
        });
      });
    });
  }

  // Huy booking - goi Flight Service de release seat
  async cancelBooking(req: Request, res: Response): Promise<void> {
    const { bookingId } = req.body;

    if (!bookingId) {
      res.status(400).json({ message: 'Missing booking ID' });
      return;
    }

    // Lay thong tin booking
    const getBookingQuery = 'SELECT FlightID, BookingStatus FROM Bookings WHERE BookingID = ?';
    connection.query(getBookingQuery, [bookingId], async (err, results: any) => {
      if (err) {
        console.error('Error fetching booking:', err);
        res.status(500).json({ message: 'Error fetching booking', error: err.message });
        return;
      }

      if (results.length === 0) {
        res.status(404).json({ message: 'Booking not found' });
        return;
      }

      if (results[0].BookingStatus === 'cancelled') {
        res.status(400).json({ message: 'Booking is already cancelled' });
        return;
      }

      const flightId = results[0].FlightID;

      // Update booking status
      const updateQuery = 'UPDATE Bookings SET BookingStatus = ? WHERE BookingID = ?';
      connection.execute(updateQuery, ['cancelled', bookingId], async (err, result: any) => {
        if (err) {
          console.error('Error cancelling booking:', err);
          res.status(500).json({ message: 'Error cancelling booking', error: err.message });
          return;
        }

        // Release seat via Flight Service
        try {
          await axios.post(`${this.flightServiceUrl}/api/Flights/${flightId}/release-seat`);
        } catch (releaseError: any) {
          console.error('Error releasing seat:', releaseError.message);
          // Van tra ve success vi booking da bi cancel
        }

        res.status(200).json({ message: 'Booking cancelled successfully' });
      });
    });
  }

  // Xu ly thanh toan - tao payment record va update PaymentStatus cua booking
  processPayment(req: Request, res: Response): void {
    const paymentData: ProcessPaymentRequest = req.body;

    if (!paymentData.bookingId || !paymentData.amount) {
      res.status(400).json({ message: 'Missing required fields' });
      return;
    }

    const insertPaymentQuery = `
      INSERT INTO Payments (BookingID, Amount, PaymentStatus) 
      VALUES (?, ?, 'completed')
    `;

    connection.execute(
      insertPaymentQuery,
      [paymentData.bookingId, paymentData.amount],
      (err, result: any) => {
        if (err) {
          console.error('Error processing payment:', err);
          res.status(500).json({ message: 'Error processing payment', error: err.message });
          return;
        }

        const updateBookingQuery = 'UPDATE Bookings SET PaymentStatus = ? WHERE BookingID = ?';
        connection.execute(updateBookingQuery, ['paid', paymentData.bookingId], (err) => {
          if (err) {
            console.error('Error updating booking payment status:', err);
            res.status(500).json({ message: 'Payment processed but failed to update booking', error: err.message });
            return;
          }

          res.status(200).json({
            message: 'Payment processed successfully',
            paymentId: result.insertId
          });
        });
      }
    );
  }

  // Lay thong tin payment theo BookingID
  getPaymentByBookingId(req: Request, res: Response): void {
    const { bookingId } = req.params;

    if (!bookingId) {
      res.status(400).json({ message: 'Missing booking ID' });
      return;
    }

    const query = 'SELECT * FROM Payments WHERE BookingID = ?';
    connection.execute(query, [bookingId], (err, results) => {
      if (err) {
        console.error('Error fetching payment:', err);
        res.status(500).json({ message: 'Error fetching payment', error: err.message });
        return;
      }

      if ((results as any).length === 0) {
        res.status(404).json({ message: 'No payment found for this booking' });
        return;
      }

      res.status(200).json((results as any)[0]);
    });
  }

  // Xoa booking hoan toan khoi database (Admin only)
  deleteBooking(req: Request, res: Response): void {
    const { bookingId } = req.body;

    if (!bookingId) {
      res.status(400).json({ message: 'Missing booking ID' });
      return;
    }

    const query = 'DELETE FROM Bookings WHERE BookingID = ?';
    connection.execute(query, [bookingId], (err, result: any) => {
      if (err) {
        console.error('Error deleting booking:', err);
        res.status(500).json({ message: 'Error deleting booking', error: err.message });
        return;
      }

      if (result.affectedRows === 0) {
        res.status(404).json({ message: 'Booking not found' });
        return;
      }

      res.status(200).json({ message: 'Booking deleted successfully' });
    });
  }

  // Lay flights da dat cua user - goi User Service va Flight Service
  async getUserFlights(req: Request, res: Response): Promise<void> {
    const { userID } = req.body;

    if (!userID) {
      res.status(400).json({ message: 'User ID is required' });
      return;
    }

    try {
      // Check user exists via User Service
      await axios.get(`${this.userServiceUrl}/api/users/${userID}`);

      // Get bookings for this user
      const getBookingsQuery = 'SELECT * FROM Bookings WHERE UserID = ?';
      connection.query(getBookingsQuery, [userID], async (err, bookingResults: any) => {
        if (err) {
          res.status(500).json({ message: 'Error fetching bookings', error: err.message });
          return;
        }

        if (bookingResults.length === 0) {
          res.status(404).json({ message: 'No booking found for this user' });
          return;
        }

        // For each booking, get flight details from Flight Service
        try {
          const bookingsWithFlights = await Promise.all(
            bookingResults.map(async (booking: any) => {
              try {
                const flightResponse = await axios.get(`${this.flightServiceUrl}/api/Flights/${booking.FlightID}`);
                return {
                  BookingID: booking.BookingID,
                  BookingDate: booking.BookingDate,
                  BookingStatus: booking.BookingStatus,
                  PaymentStatus: booking.PaymentStatus,
                  ...flightResponse.data
                };
              } catch (error) {
                console.error(`Error fetching flight ${booking.FlightID}:`, error);
                return {
                  BookingID: booking.BookingID,
                  BookingDate: booking.BookingDate,
                  BookingStatus: booking.BookingStatus,
                  PaymentStatus: booking.PaymentStatus,
                  flightDetails: null
                };
              }
            })
          );

          res.status(200).json(bookingsWithFlights);
        } catch (error: any) {
          console.error('Error fetching flight details:', error.message);
          res.status(500).json({ message: 'Error fetching flight details', error: error.message });
        }
      });
    } catch (error: any) {
      if (error.response?.status === 404) {
        res.status(404).json({ message: 'User not found' });
      } else {
        console.error('Error calling User Service:', error.message);
        res.status(500).json({ message: 'Error verifying user', error: error.message });
      }
    }
  }

  // Xem va thong ke tat ca bookings voi thong tin chi tiet (Admin only)
  async viewAndSummarizeBookings(req: Request, res: Response): Promise<void> {
    const { userID } = req.body;

    if (!userID) {
      res.status(400).json({ message: 'UserID is required' });
      return;
    }

    try {
      // Check admin role via User Service
      const userRoleResponse = await axios.get(`${this.userServiceUrl}/api/users/${userID}/role`);

      if (userRoleResponse.data.role !== 'Admin') {
        res.status(403).json({ message: 'Permission denied: User is not an admin' });
        return;
      }

      // Get all bookings
      const bookingQuery = 'SELECT * FROM Bookings ORDER BY BookingID DESC';
      connection.query(bookingQuery, async (err, bookingResults: any) => {
        if (err) {
          console.error('Error fetching bookings:', err);
          res.status(500).json({ message: 'Failed to fetch booking statistics' });
          return;
        }

        // For each booking, fetch user and flight details
        try {
          const bookingsWithDetails = await Promise.all(
            bookingResults.map(async (booking: any) => {
              let userName = 'Unknown';
              let flightDetails: any = {};

              try {
                const userResponse = await axios.get(`${this.userServiceUrl}/api/users/${booking.UserID}`);
                userName = userResponse.data.Name || 'Unknown';
              } catch (error) {
                console.error(`Error fetching user ${booking.UserID}:`, error);
              }

              try {
                const flightResponse = await axios.get(`${this.flightServiceUrl}/api/Flights/${booking.FlightID}`);
                flightDetails = flightResponse.data;
              } catch (error) {
                console.error(`Error fetching flight ${booking.FlightID}:`, error);
              }

              return {
                BookingID: booking.BookingID,
                UserID: booking.UserID,
                UserName: userName,
                BookingDate: new Date(booking.BookingDate).toLocaleString('vi-VN', {
                  timeZone: 'Asia/Ho_Chi_Minh',
                }),
                FlightID: booking.FlightID,
                Departure: flightDetails.Departure || 'N/A',
                Arrival: flightDetails.Arrival || 'N/A',
                DepartureTime: flightDetails.DepartureTime ? new Date(flightDetails.DepartureTime).toLocaleString('vi-VN', {
                  timeZone: 'Asia/Ho_Chi_Minh',
                }) : 'N/A',
                ArrivalTime: flightDetails.ArrivalTime ? new Date(flightDetails.ArrivalTime).toLocaleString('vi-VN', {
                  timeZone: 'Asia/Ho_Chi_Minh',
                }) : 'N/A',
                Price: flightDetails.Price || 0,
              };
            })
          );

          res.status(200).json({
            message: 'Booking statistics retrieved successfully',
            totalBookings: bookingsWithDetails.length,
            bookings: bookingsWithDetails,
          });
        } catch (error: any) {
          console.error('Error fetching booking details:', error.message);
          res.status(500).json({ message: 'Error fetching booking details', error: error.message });
        }
      });
    } catch (error: any) {
      console.error('Error calling User Service:', error.message);
      res.status(500).json({
        message: 'Error verifying user permissions',
        error: error.message
      });
    }
  }

  // Dat ve - LEGACY METHOD (deprecated - use createBooking instead)
  // NOTE: Method nay van query truc tiep vao Users va Flights tables (vi day la legacy code)
  // Nen dung method createBooking() thay the (da duoc cap nhat de goi microservices)
  bookFlight(req: Request, res: Response): void {
    res.status(410).json({
      message: 'This endpoint is deprecated. Please use POST /api/Bookings/create instead.',
      hint: 'The new endpoint uses microservices architecture and communicates via REST APIs.'
    });
  }
}
