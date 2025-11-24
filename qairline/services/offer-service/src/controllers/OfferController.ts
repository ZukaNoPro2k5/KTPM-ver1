// Controller xu ly nghiep vu quan ly offers (khuyen mai/tin tuc)
import { Request, Response } from 'express';
import connection from '../database/database';
import { CreateOfferRequest, DeleteOfferRequest } from '../types/offer';
import { sendEmail } from '../services/EmailService';
import { cacheService } from '../services/CacheService';
import axios from 'axios';

export class OfferController {
  private userServiceUrl = process.env.USER_SERVICE_URL || 'http://localhost:5001';

  // Lay tat ca offers (public - khong can dang nhap)
  async getAllOffers(req: Request, res: Response): Promise<void> {
    const cacheKey = 'offers:all';
    
    // Try to get from cache first
    const cachedData = await cacheService.get(cacheKey);
    if (cachedData) {
      res.status(200).json(JSON.parse(cachedData));
      return;
    }

    const query = 'SELECT PostID, Title, Content, PostDate FROM Offers';
    
    connection.query(query, async (err, results) => {
      if (err) {
        console.error('Error executing query:', err.stack);
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
        return;
      }

      // Nếu không có kết quả
      if ((results as any).length === 0) {
        res.status(404).json({ message: 'No offers found' });
        return;
      }

      // Save to cache for 1 hour (offers change infrequently)
      await cacheService.set(cacheKey, JSON.stringify(results), 3600);

      // Trả về tất cả các offers
      res.status(200).json(results);
    });
  }

  // Tao offer moi (Admin only) va gui email thong bao cho tat ca users
  async createOffer(req: Request, res: Response): Promise<void> {
    const { title, content, userID }: CreateOfferRequest = req.body;

    if (!title || !content || !userID) {
      res.status(400).json({ message: 'Missing required fields: title, content, or UserID' });
      return;
    }

    try {
      // Kiem tra admin via User Service
      const userRoleResponse = await axios.get(`${this.userServiceUrl}/api/users/${userID}/role`);
      
      if (userRoleResponse.data.role !== 'Admin') {
        res.status(403).json({ message: 'Permission denied: User is not an admin' });
        return;
      }

      // Tao offer moi
      const insertQuery = 'INSERT INTO Offers (Title, Content) VALUES (?, ?)';
      connection.query(insertQuery, [title, content], async (err) => {
        if (err) {
          console.error('Error inserting offer:', err);
          res.status(500).json({ message: 'Failed to create Offer' });
          return;
        }

        // Invalidate cache
        await cacheService.del('offers:all');

        // Lay email tat ca users via User Service
        try {
          const emailsResponse = await axios.get(`${this.userServiceUrl}/api/users/emails/all`);
          const emails = emailsResponse.data.emails;

          // Gui email song song cho tat ca users
          await Promise.all(
            emails.map((email: string) =>
              sendEmail(
                email,
                `New Offer: ${title}`,
                `Hello,\n\nWe have a new offer for you:\n\n${content}\n\nBest regards,\nQAirline Team`
              ).catch((error) => {
                console.error(`Failed to send email to ${email}:`, error);
              })
            )
          );

          const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
          res.status(201).json({
            message: 'Offer created successfully and notifications sent',
            timestamp,
          });
        } catch (emailError: any) {
          console.error('Error getting emails or sending notifications:', emailError.message);
          res.status(201).json({ message: 'Offer created but failed to send notifications' });
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

  // Xoa offer (Admin only)
  async deleteOffer(req: Request, res: Response): Promise<void> {
    const { postID, UserID }: DeleteOfferRequest = req.body;

    if (!postID || !UserID) {
      res.status(400).json({ message: 'Missing required fields: postID or UserID' });
      return;
    }

    try {
      // Kiem tra admin via User Service
      const userRoleResponse = await axios.get(`${this.userServiceUrl}/api/users/${UserID}/role`);
      
      if (userRoleResponse.data.role !== 'Admin') {
        res.status(403).json({ message: 'Permission denied: User is not an admin' });
        return;
      }

      // Kiem tra offer co ton tai khong
      const checkPostQuery = 'SELECT PostID FROM Offers WHERE PostID = ?';
      connection.query(checkPostQuery, [postID], (err, postResults: any) => {
        if (err) {
          res.status(500).json({ message: 'Error checking post existence', error: err.message });
          return;
        }

        if (postResults.length === 0) {
          res.status(404).json({ message: 'Post not found' });
          return;
        }

        // Xoa offer
        const deleteQuery = 'DELETE FROM Offers WHERE PostID = ?';
        connection.query(deleteQuery, [postID], async (err, results: any) => {
          if (err) {
            console.error('Error executing query:', err.stack);
            res.status(500).json({ message: 'Internal Server Error', error: err.message });
            return;
          }

          if (results.affectedRows === 0) {
            res.status(404).json({ message: 'Offer not found or user does not have permission' });
            return;
          }

          // Invalidate cache
          await cacheService.del('offers:all');

          res.status(200).json({ message: 'Offer deleted successfully' });
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
}