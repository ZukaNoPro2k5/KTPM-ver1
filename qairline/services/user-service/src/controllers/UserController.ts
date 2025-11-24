// Controller quan ly user: authentication va CRUD users
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import connection from '../database/database';

export class UserController {
  // Dang nhap: kiem tra email/password va tra ve JWT token
  signIn(req: Request, res: Response) {
    const { email, password } = req.body;
    
    connection.execute('SELECT * FROM Users WHERE Email = ?', [email], (err, results) => {
      if (err) {
        console.error('Database query error:', err);
        return res.status(500).json({ message: 'Error querying database' });
      }

      const rows = results as any[];
      if (rows.length === 0) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      const user = rows[0];

      bcrypt.compare(password, user.Password, (err, isMatch) => {
        if (err) {
          console.error('Error comparing passwords:', err);
          return res.status(500).json({ message: 'Error comparing passwords' });
        }

        if (!isMatch) {
          return res.status(401).json({ message: 'Invalid email or password' });
        }

        const token = jwt.sign(
          {
            userid: user.UserID,
            email: user.Email,
            username: user.Username,
            name: user.Name,
            role: user.Role,
          },
          'secret_key',
          { expiresIn: '1h' }
        );

        return res.json({
          message: 'Sign in successful',
          token,
        });
      });
    });
  }

  // Dang ky: tao user moi voi password da hash, tra ve JWT token
  signUp(req: Request, res: Response) {
    const { name, username, email, password, role } = req.body;

    if (!name || !username || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    connection.execute('SELECT * FROM Users WHERE Username = ? OR Email = ?', [username, email], (err, results) => {
      if (err) {
        console.error('Database query error:', err);
        return res.status(500).json({ message: 'Error querying database' });
      }

      const rows = results as any[];
      if (rows.length > 0) {
        return res.status(400).json({ message: 'Username or Email already exists' });
      }

      bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) {
          console.error('Error hashing password:', err);
          return res.status(500).json({ message: 'Error hashing password' });
        }

        connection.execute(
          'INSERT INTO Users (Name, Username, Email, Password, Role) VALUES (?, ?, ?, ?, ?)',
          [name, username, email, hashedPassword, role || 'Customer'],
          (err, result: any) => {
            if (err) {
              console.error('Database insert error:', err);
              return res.status(500).json({ message: 'Error inserting user into database' });
            }

            const token = jwt.sign(
              { userid: result.insertId, email, username, name, role },
              'secret_key',
              { expiresIn: '1h' }
            );

            res.status(201).json({
              message: 'Sign up successful',
              token,
            });
          }
        );
      });
    });
  }

  // Lay tat ca users (Admin only - validation o frontend/gateway)
  getAllUsers(req: Request, res: Response) {
    const query = 'SELECT * FROM Users';
    connection.query(query, (err, results) => {
      if (err) {
        console.error('Error executing query:', err.stack);
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
        return;
      }

      if ((results as any).length === 0) {
        res.status(404).json({ message: 'No users found' });
        return;
      }

      res.status(200).json(results);
    });
  }

  // Xoa user theo UserID (Admin only - validation o frontend/gateway)
  deleteUser(req: Request, res: Response) {
    const { UserID } = req.body;

    if (!UserID) {
      res.status(400).json({ message: 'Missing required field: userID' });
      return;
    }

    const query = 'DELETE FROM Users WHERE UserID = ?';
    connection.query(query, [UserID], (err, result: any) => {
      if (err) {
        console.error('Error executing query:', err.stack);
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
        return;
      }

      if (result.affectedRows === 0) {
        res.status(404).json({ message: 'User not found' });
        return;
      }

      res.status(200).json({ message: 'User deleted successfully' });
    });
  }

  // ============================================
  // INTERNAL APIs - For other services to call
  // ============================================

  // Get user by ID (for other services to verify user exists)
  getUserById(req: Request, res: Response) {
    const { userId } = req.params;
    
    if (!userId) {
      res.status(400).json({ message: 'Missing user ID' });
      return;
    }

    connection.execute(
      'SELECT UserID, Name, Username, Email, Role, CreatedAt FROM Users WHERE UserID = ?',
      [userId],
      (err, results: any) => {
        if (err) {
          console.error('Error fetching user:', err);
          res.status(500).json({ message: 'Error fetching user', error: err.message });
          return;
        }

        if (results.length === 0) {
          res.status(404).json({ message: 'User not found' });
          return;
        }

        res.json(results[0]);
      }
    );
  }

  // Get user role (for other services to check admin)
  getUserRole(req: Request, res: Response) {
    const { userId } = req.params;
    
    if (!userId) {
      res.status(400).json({ message: 'Missing user ID' });
      return;
    }

    connection.execute(
      'SELECT Role FROM Users WHERE UserID = ?',
      [userId],
      (err, results: any) => {
        if (err) {
          console.error('Error fetching user role:', err);
          res.status(500).json({ message: 'Error fetching user role', error: err.message });
          return;
        }

        if (results.length === 0) {
          res.status(404).json({ message: 'User not found' });
          return;
        }

        res.json({ role: results[0].Role });
      }
    );
  }

  // Get all user emails (for Offer Service to send notifications)
  getAllEmails(req: Request, res: Response) {
    connection.query(
      'SELECT Email FROM Users WHERE Email IS NOT NULL',
      (err, results: any) => {
        if (err) {
          console.error('Error fetching emails:', err);
          res.status(500).json({ message: 'Error fetching emails', error: err.message });
          return;
        }

        const emails = results.map((user: any) => user.Email);
        res.json({ emails });
      }
    );
  }
}