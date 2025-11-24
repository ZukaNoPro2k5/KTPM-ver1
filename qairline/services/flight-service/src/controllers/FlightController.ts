// Controller quan ly flights va aircrafts
import { Request, Response } from 'express';
import connection from '../database/database';
import { Flight, CreateFlightRequest } from '../types/flight';
import { sendEmail } from '../services/EmailService';
import { cacheService } from '../services/CacheService';
import axios from 'axios';
import moment from 'moment-timezone';

export class FlightController {
  private userServiceUrl: string;

  constructor() {
    this.userServiceUrl = process.env.USER_SERVICE_URL || 'http://localhost:5001';
  }

  // Lay tat ca flights (public - guest co the xem)
  async getAllFlights(req: Request, res: Response): Promise<void> {
    const cacheKey = 'flights:all';
    
    // Try to get from cache first
    const cachedData = await cacheService.get(cacheKey);
    if (cachedData) {
      res.json(JSON.parse(cachedData));
      return;
    }

    const query = `
      SELECT 
        f.FlightID, 
        a.Model AS AircraftModel, 
        f.Departure, 
        f.Arrival, 
        f.DepartureTime, 
        f.ArrivalTime, 
        f.Price, 
        f.SeatsAvailable, 
        f.Status
      FROM Flights f
      JOIN Aircrafts a ON f.AircraftTypeID = a.AircraftID
    `;
    
    connection.query(query, async (err, results) => {
      if (err) {
        console.error('Error executing query:', err.stack);
        return res.status(500).send('Internal Server Error');
      }
      
      // Save to cache for 5 minutes
      await cacheService.set(cacheKey, JSON.stringify(results), 300);
      
      res.json(results);
    });
  }

  // Tao flight moi (Admin only)
  async createFlight(req: Request, res: Response): Promise<void> {
    const { model, departure, arrival, departureTime, arrivalTime, price, seatsAvailable, status, userID, aircraftTypeId } = req.body;

    // Validate input
    if (!departure || !arrival || !departureTime || !arrivalTime || !price || seatsAvailable == null || !userID) {
      res.status(400).json({ message: 'Missing required fields' });
      return;
    }

    try {
      // Kiem tra user co phai Admin khong via User Service
      const userRoleResponse = await axios.get(`${this.userServiceUrl}/api/users/${userID}/role`);
      
      if (userRoleResponse.data.role !== 'Admin') {
        res.status(403).json({ message: 'Permission denied: User is not an admin' });
        return;
      }

      // Neu truyen model, lay AircraftTypeID tu model name
      if (model && !aircraftTypeId) {
        const getAircraftQuery = 'SELECT AircraftID FROM Aircrafts WHERE Model = ?';
        connection.query(getAircraftQuery, [model], (err, results: any) => {
          if (err) {
            console.error('Error fetching aircraft:', err);
            res.status(500).json({ message: 'Error fetching aircraft', error: err.message });
            return;
          }

          if (results.length === 0) {
            res.status(404).json({ message: 'Aircraft model not found' });
            return;
          }

          const aircraftTypeIdFromModel = results[0].AircraftID;
          this.insertFlight(res, aircraftTypeIdFromModel, departure, arrival, departureTime, arrivalTime, price, seatsAvailable, status);
        });
      } else {
        // Neu da co aircraftTypeId, tao flight luon
        this.insertFlight(res, aircraftTypeId, departure, arrival, departureTime, arrivalTime, price, seatsAvailable, status);
      }
    } catch (error: any) {
      console.error('Error calling User Service:', error.message);
      res.status(500).json({ 
        message: 'Error verifying user permissions',
        error: error.message 
      });
    }
  }

  // Helper function de insert flight vao database
  private insertFlight(
    res: Response,
    aircraftTypeId: number,
    departure: string,
    arrival: string,
    departureTime: string,
    arrivalTime: string,
    price: number,
    seatsAvailable: number,
    status?: string
  ): void {
    const query = `
      INSERT INTO Flights 
      (AircraftTypeID, Departure, Arrival, DepartureTime, ArrivalTime, Price, SeatsAvailable, Status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    connection.execute(
      query,
      [aircraftTypeId, departure, arrival, departureTime, arrivalTime, price, seatsAvailable, status || 'scheduled'],
      async (err, result: any) => {
        if (err) {
          console.error('Error creating flight:', err);
          res.status(500).json({ message: 'Error creating flight', error: err.message });
          return;
        }

        // Invalidate cache
        await cacheService.delPattern('flights:*');

        res.status(201).json({
          message: 'Flight added successfully',
          flightId: result.insertId
        });
      }
    );
  }

  // Cap nhat status cua flight (Admin only)
  // Logic:
  // 1. Validate input
  // 2. Kiem tra user co phai Admin khong via User Service
  // 3. Kiem tra flight co ton tai khong
  // 4. Update flight status
  async updateFlightStatus(req: Request, res: Response): Promise<void> {
    const { flightId, status, userID } = req.body;

    // Buoc 1: Validate input
    if (!flightId || !status || !userID) {
      res.status(400).json({ message: 'Missing required fields: flightId, status, or userID' });
      return;
    }

    try {
      // Buoc 2: Kiem tra user co phai Admin khong via User Service
      const userRoleResponse = await axios.get(`${this.userServiceUrl}/api/users/${userID}/role`);
      
      if (userRoleResponse.data.role !== 'Admin') {
        res.status(403).json({ message: 'Permission denied: User is not an admin' });
        return;
      }

      // Buoc 3: Kiem tra flight co ton tai khong
      const checkFlightQuery = 'SELECT FlightID FROM Flights WHERE FlightID = ?';
      connection.query(checkFlightQuery, [flightId], (err, flightResults: any) => {
        if (err) {
          res.status(500).json({ message: 'Error checking flight existence', error: err.message });
          return;
        }

        if (flightResults.length === 0) {
          res.status(404).json({ message: 'Flight not found' });
          return;
        }

        // Buoc 4: Update flight status
        const updateQuery = 'UPDATE Flights SET Status = ? WHERE FlightID = ?';
        connection.execute(updateQuery, [status, flightId], async (err, result: any) => {
          if (err) {
            console.error('Error updating flight status:', err);
            res.status(500).json({ message: 'Error updating flight status', error: err.message });
            return;
          }

          // Invalidate cache
          await cacheService.delPattern('flights:*');
          await cacheService.del(`flight:${flightId}`);

          res.status(200).json({ message: 'Flight status updated successfully' });
        });
      });
    } catch (error: any) {
      console.error('Error calling User Service:', error.message);
      res.status(500).json({ 
        message: 'Error verifying user permissions',
        error: error.message 
      });
    }
  }

  // Xoa flight (Admin only)
  // Logic:
  // 1. Validate input
  // 2. Kiem tra user co phai Admin khong via User Service
  // 3. Kiem tra flight co ton tai khong
  // 4. Xoa flight
  async deleteFlight(req: Request, res: Response): Promise<void> {
    const { flightId, userID } = req.body;

    // Buoc 1: Validate input
    if (!flightId || !userID) {
      res.status(400).json({ message: 'Missing required fields: flightId or userID' });
      return;
    }

    try {
      // Buoc 2: Kiem tra user co phai Admin khong via User Service
      const userRoleResponse = await axios.get(`${this.userServiceUrl}/api/users/${userID}/role`);
      
      if (userRoleResponse.data.role !== 'Admin') {
        res.status(403).json({ message: 'Permission denied: User is not an admin' });
        return;
      }

      // Buoc 3: Kiem tra flight co ton tai khong
      const checkFlightQuery = 'SELECT FlightID FROM Flights WHERE FlightID = ?';
      connection.query(checkFlightQuery, [flightId], (err, flightResults: any) => {
        if (err) {
          res.status(500).json({ message: 'Error checking flight existence', error: err.message });
          return;
        }

        if (flightResults.length === 0) {
          res.status(404).json({ message: 'Flight not found' });
          return;
        }

        // Buoc 4: Xoa flight
        const deleteQuery = 'DELETE FROM Flights WHERE FlightID = ?';
        connection.execute(deleteQuery, [flightId], async (err, result: any) => {
          if (err) {
            console.error('Error deleting flight:', err);
            res.status(500).json({ message: 'Error deleting flight', error: err.message });
            return;
          }

          // Invalidate cache
          await cacheService.delPattern('flights:*');
          await cacheService.del(`flight:${flightId}`);

          res.status(200).json({ message: 'Flight deleted successfully' });
        });
      });
    } catch (error: any) {
      console.error('Error calling User Service:', error.message);
      res.status(500).json({ 
        message: 'Error verifying user permissions',
        error: error.message 
      });
    }
  }

  // Tim flight theo departure va arrival (public - user va guest dung)
  // Logic:
  // 1. Validate input
  // 2. Tim flights theo route
  // 3. Tra ve ket qua (co the rong)
  async searchFlights(req: Request, res: Response): Promise<void> {
    const { departure, arrival, flightID } = req.body;

    // Neu co flightID, tim theo flightID cu the
    if (flightID) {
      const cacheKey = `flight:${flightID}`;
      const cachedData = await cacheService.get(cacheKey);
      
      if (cachedData) {
        res.status(200).json(JSON.parse(cachedData));
        return;
      }

      const queryById = `
        SELECT 
          f.FlightID, f.Departure, f.Arrival, f.DepartureTime, f.ArrivalTime, 
          f.Price, f.SeatsAvailable, f.Status, 
          a.Model AS AircraftModel 
        FROM Flights f
        JOIN Aircrafts a ON f.AircraftTypeID = a.AircraftID
        WHERE f.FlightID = ?
      `;
      
      connection.query(queryById, [flightID], async (err, results) => {
        if (err) {
          console.error('Error searching flight by ID:', err);
          res.status(500).json({ message: 'Error searching flight', error: err.message });
          return;
        }

        if ((results as any).length === 0) {
          res.status(404).json({ message: 'Flight not found' });
          return;
        }

        // Cache individual flight for 5 minutes
        await cacheService.set(cacheKey, JSON.stringify(results), 300);

        res.status(200).json(results);
      });
      return;
    }

    // Buoc 1: Validate input cho search theo route
    if (!departure || !arrival) {
      res.status(400).json({ message: 'Missing search parameters: departure and arrival are required' });
      return;
    }

    const cacheKey = `flights:search:${departure}:${arrival}`;
    const cachedData = await cacheService.get(cacheKey);
    
    if (cachedData) {
      res.status(200).json(JSON.parse(cachedData));
      return;
    }

    // Buoc 2: Tim flights theo departure va arrival
    const query = `
      SELECT 
        f.FlightID, f.Departure, f.Arrival, f.DepartureTime, f.ArrivalTime, 
        f.Price, f.SeatsAvailable, f.Status,
        a.Model AS AircraftModel
      FROM Flights f
      JOIN Aircrafts a ON f.AircraftTypeID = a.AircraftID
      WHERE f.Departure = ? AND f.Arrival = ?
    `;
    
    connection.execute(query, [departure, arrival], async (err, results) => {
      if (err) {
        console.error('Error searching flights:', err);
        res.status(500).json({ message: 'Error searching flights', error: err.message });
        return;
      }

      // Buoc 3: Tra ve ket qua (cho phep empty results)
      if ((results as any).length === 0) {
        res.status(404).json({ message: 'No flights found for the given route' });
        return;
      }

      // Cache search results for 5 minutes
      await cacheService.set(cacheKey, JSON.stringify(results), 300);

      res.status(200).json(results);
    });
  }

  // Sua chi tiet flight (Admin only)
  // Logic:
  // 1. Validate input (chi can flightId, userID, va it nhat 1 field de update)
  // 2. Kiem tra user co phai Admin khong via User Service
  // 3. Kiem tra flight co ton tai khong
  // 4. Neu co model, lay AircraftTypeID tu model name
  // 5. Update flight voi cac fields duoc cung cap
  async editFlight(req: Request, res: Response): Promise<void> {
    const {
      userID,
      flightID,
      model,
      departure,
      arrival,
      departureTime,
      arrivalTime,
      price,
      seatsAvailable,
      status,
      aircraftTypeId
    } = req.body;

    // Buoc 1: Validate input
    if (!userID || !flightID) {
      res.status(400).json({ message: 'Missing required fields: userID or flightID' });
      return;
    }

    try {
      // Buoc 2: Kiem tra user co phai Admin khong via User Service
      const userRoleResponse = await axios.get(`${this.userServiceUrl}/api/users/${userID}/role`);
      
      if (userRoleResponse.data.role !== 'Admin') {
        res.status(403).json({ message: 'Permission denied: User is not an admin' });
        return;
      }

      // Buoc 3: Kiem tra flight co ton tai khong va lay thong tin hien tai
      const checkFlightQuery = 'SELECT * FROM Flights WHERE FlightID = ?';
      connection.query(checkFlightQuery, [flightID], (err, flightResults: any) => {
        if (err) {
          res.status(500).json({ message: 'Error checking flight existence', error: err.message });
          return;
        }

        if (flightResults.length === 0) {
          res.status(404).json({ message: 'Flight not found' });
          return;
        }

        const currentFlight = flightResults[0];

        // Format dates to VN time if provided
        const formattedDepartureTime = departureTime 
          ? moment(departureTime).tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD HH:mm:ss')
          : undefined;
          
        const formattedArrivalTime = arrivalTime
          ? moment(arrivalTime).tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD HH:mm:ss')
          : undefined;

        // Buoc 4: Neu co model, lay AircraftTypeID tu model name
        if (model && !aircraftTypeId) {
          const getAircraftQuery = 'SELECT AircraftID FROM Aircrafts WHERE Model = ?';
          connection.query(getAircraftQuery, [model], (err, aircraftResults: any) => {
            if (err) {
              res.status(500).json({ message: 'Error fetching aircraft', error: err.message });
              return;
            }

            if (aircraftResults.length === 0) {
              res.status(404).json({ message: 'Aircraft model not found' });
              return;
            }

            const aircraftTypeIdFromModel = aircraftResults[0].AircraftID;
            this.updateFlight(res, flightID, currentFlight, {
              aircraftTypeId: aircraftTypeIdFromModel,
              departure,
              arrival,
              departureTime: formattedDepartureTime,
              arrivalTime: formattedArrivalTime,
              price,
              seatsAvailable,
              status
            });
          });
        } else {
          // Buoc 5: Update flight voi cac fields duoc cung cap
          this.updateFlight(res, flightID, currentFlight, {
            aircraftTypeId: aircraftTypeId || currentFlight.AircraftTypeID,
            departure,
            arrival,
            departureTime: formattedDepartureTime,
            arrivalTime: formattedArrivalTime,
            price,
            seatsAvailable,
            status
          });
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

  // Helper function de update flight vao database
  private updateFlight(
    res: Response,
    flightID: number,
    currentFlight: any,
    updates: {
      aircraftTypeId?: number;
      departure?: string;
      arrival?: string;
      departureTime?: string;
      arrivalTime?: string;
      price?: number;
      seatsAvailable?: number;
      status?: string;
    }
  ): void {
    const updateQuery = `
      UPDATE Flights 
      SET 
        AircraftTypeID = ?,
        Departure = ?,
        Arrival = ?,
        DepartureTime = ?,
        ArrivalTime = ?,
        Price = ?,
        SeatsAvailable = ?,
        Status = ? 
      WHERE FlightID = ?
    `;

    connection.execute(
      updateQuery,
      [
        updates.aircraftTypeId ?? currentFlight.AircraftTypeID,
        updates.departure ?? currentFlight.Departure,
        updates.arrival ?? currentFlight.Arrival,
        updates.departureTime ?? currentFlight.DepartureTime,
        updates.arrivalTime ?? currentFlight.ArrivalTime,
        updates.price ?? currentFlight.Price,
        updates.seatsAvailable ?? currentFlight.SeatsAvailable,
        updates.status ?? currentFlight.Status,
        flightID
      ],
      async (err) => {
        if (err) {
          console.error('Error updating flight:', err);
          res.status(500).json({ message: 'Error updating flight', error: err.message });
          return;
        }

        // Invalidate cache
        await cacheService.delPattern('flights:*');
        await cacheService.del(`flight:${flightID}`);

        // Logic gui email thong bao
        try {
          // Lay email tat ca users via User Service
          const emailsResponse = await axios.get(`${this.userServiceUrl}/api/users/emails/all`);
          const emails = emailsResponse.data.emails;

          const departure = updates.departure ?? currentFlight.Departure;
          const arrival = updates.arrival ?? currentFlight.Arrival;
          const departureTime = updates.departureTime ?? currentFlight.DepartureTime;
          const arrivalTime = updates.arrivalTime ?? currentFlight.ArrivalTime;

          // Gui email song song cho tat ca users
          // Khong await de tranh block response
          Promise.all(
            emails.map((email: string) =>
              sendEmail(
                email,
                `Flight Update Notification`,
                `Hello,\n\nThe flight details have been updated:\n\nFrom: ${departure}\nTo: ${arrival}\nDeparture Time: ${departureTime}\nArrival Time: ${arrivalTime}\n\nBest regards,\nQAirline Team`
              ).catch((error) => {
                console.error(`Failed to send email to ${email}:`, error);
              })
            )
          );

          const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
          res.status(200).json({ 
            message: 'Flight information updated successfully and notifications sent',
            flightID,
            timestamp
          });
        } catch (emailError: any) {
          console.error('Error getting emails or sending notifications:', emailError.message);
          // Van tra ve success vi flight da duoc update
          res.status(200).json({ message: 'Flight updated but failed to send notifications' });
        }
      }
    );
  }

  // ============================================
  // INTERNAL APIs - For other services to call
  // ============================================

  // Get flight by ID (for Booking Service)
  getFlightById(req: Request, res: Response): void {
    const { flightId } = req.params;

    if (!flightId) {
      res.status(400).json({ message: 'Missing flight ID' });
      return;
    }

    const query = `
      SELECT 
        f.FlightID,
        f.AircraftTypeID,
        f.Departure,
        f.Arrival,
        f.DepartureTime,
        f.ArrivalTime,
        f.Price,
        f.SeatsAvailable,
        f.Status,
        a.Model AS AircraftModel,
        a.Capacity
      FROM Flights f
      JOIN Aircrafts a ON f.AircraftTypeID = a.AircraftID
      WHERE f.FlightID = ?
    `;

    connection.execute(query, [flightId], (err, results: any) => {
      if (err) {
        console.error('Error fetching flight:', err);
        res.status(500).json({ message: 'Error fetching flight', error: err.message });
        return;
      }

      if (results.length === 0) {
        res.status(404).json({ message: 'Flight not found' });
        return;
      }

      res.json(results[0]);
    });
  }

  // Reserve seat (decrease SeatsAvailable by 1)
  reserveSeat(req: Request, res: Response): void {
    const { flightId } = req.params;

    if (!flightId) {
      res.status(400).json({ message: 'Missing flight ID' });
      return;
    }

    connection.beginTransaction((err) => {
      if (err) {
        console.error('Transaction error:', err);
        res.status(500).json({ message: 'Transaction error', error: err.message });
        return;
      }

      // Lock row and check seats available
      connection.execute(
        'SELECT SeatsAvailable FROM Flights WHERE FlightID = ? FOR UPDATE',
        [flightId],
        (err, results: any) => {
          if (err) {
            return connection.rollback(() => {
              console.error('Error checking seats:', err);
              res.status(500).json({ message: 'Error checking seats', error: err.message });
            });
          }

          if (results.length === 0) {
            return connection.rollback(() => {
              res.status(404).json({ message: 'Flight not found' });
            });
          }

          if (results[0].SeatsAvailable <= 0) {
            return connection.rollback(() => {
              res.status(400).json({ message: 'No seats available' });
            });
          }

          // Decrease seats
          connection.execute(
            'UPDATE Flights SET SeatsAvailable = SeatsAvailable - 1 WHERE FlightID = ?',
            [flightId],
            (err) => {
              if (err) {
                return connection.rollback(() => {
                  console.error('Error reserving seat:', err);
                  res.status(500).json({ message: 'Error reserving seat', error: err.message });
                });
              }

              connection.commit(async (err) => {
                if (err) {
                  return connection.rollback(() => {
                    console.error('Commit error:', err);
                    res.status(500).json({ message: 'Commit error', error: err.message });
                  });
                }

                // Invalidate cache
                await cacheService.delPattern('flights:*');
                await cacheService.del(`flight:${flightId}`);

                res.json({ message: 'Seat reserved successfully' });
              });
            }
          );
        }
      );
    });
  }

  // Release seat (increase SeatsAvailable by 1)
  releaseSeat(req: Request, res: Response): void {
    const { flightId } = req.params;

    if (!flightId) {
      res.status(400).json({ message: 'Missing flight ID' });
      return;
    }

    connection.execute(
      'UPDATE Flights SET SeatsAvailable = SeatsAvailable + 1 WHERE FlightID = ?',
      [flightId],
      async (err, result: any) => {
        if (err) {
          console.error('Error releasing seat:', err);
          res.status(500).json({ message: 'Error releasing seat', error: err.message });
          return;
        }

        if (result.affectedRows === 0) {
          res.status(404).json({ message: 'Flight not found' });
          return;
        }

        // Invalidate cache
        await cacheService.delPattern('flights:*');
        await cacheService.del(`flight:${flightId}`);

        res.json({ message: 'Seat released successfully' });
      }
    );
  }
}
