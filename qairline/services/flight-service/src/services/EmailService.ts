// Service gửi email thông báo khuyến mãi cho users
import nodemailer from 'nodemailer';

// Cấu hình Gmail transporter (cần app password trong .env)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Gửi email đến một địa chỉ
export const sendEmail = async (to: string, subject: string, text: string): Promise<void> => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text,
    });
    console.log(`Email sent successfully to ${to}`);
  } catch (error) {
    console.error(`Error sending email to ${to}:`, error);
    throw error;
  }
};
