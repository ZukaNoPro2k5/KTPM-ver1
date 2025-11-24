-- ============================================
-- DATABASE SETUP - TRUE MICROSERVICES PATTERN
-- ============================================
-- Mỗi service có DATABASE RIÊNG BIỆT
-- Đây là cách làm ĐÚNG với bản chất microservices
-- ============================================

-- ============================================
-- 1. USER SERVICE DATABASE
-- ============================================
DROP SCHEMA IF EXISTS `user_service_db`;
CREATE SCHEMA IF NOT EXISTS `user_service_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `user_service_db`;

-- Table Users - Quản lý thông tin người dùng và authentication
CREATE TABLE Users (
    UserID INT AUTO_INCREMENT PRIMARY KEY,
    Name VARCHAR(100) NOT NULL COMMENT 'Tên đầy đủ của người dùng',
    Username VARCHAR(100) UNIQUE NOT NULL COMMENT 'Tên đăng nhập (unique)',
    Email VARCHAR(100) UNIQUE NOT NULL COMMENT 'Email (unique)',
    Password VARCHAR(255) NOT NULL COMMENT 'Mật khẩu đã được hash bằng bcrypt',
    Role ENUM('Customer', 'Admin', 'Non-Customer') NOT NULL DEFAULT 'Customer' COMMENT 'Vai trò: Customer, Admin, Non-Customer',
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời gian tạo tài khoản',
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Thời gian cập nhật gần nhất',
    INDEX idx_email (Email),
    INDEX idx_username (Username),
    INDEX idx_role (Role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
COMMENT='User Service Database - Owns all user data';

-- Sample Users (passwords là plain text cho demo, production phải hash)
INSERT INTO Users (Name, Username, Email, Password, Role)
VALUES
    ('John Doe', 'john_doe', 'john@example.com', '$2a$10$abcdefghijklmnopqrstuv', 'Customer'),
    ('Jane Smith', 'jane_smith', 'jane@example.com', '$2a$10$abcdefghijklmnopqrstuv', 'Customer'),
    ('Alice Johnson', 'alice_johnson', 'alice@example.com', '$2a$10$abcdefghijklmnopqrstuv', 'Admin'),
    ('Bob Brown', 'bob_brown', 'bob@example.com', '$2a$10$abcdefghijklmnopqrstuv', 'Customer'),
    ('Charlie White', 'charlie_white', 'charlie@example.com', '$2a$10$abcdefghijklmnopqrstuv', 'Customer'),
    ('Admin User', 'a dmin', 'admin@qairline.com', '$2a$10$abcdefghijklmnopqrstuv', 'Admin');

SELECT '✅ User Service Database created successfully!' AS Status;

-- ============================================
-- 2. FLIGHT SERVICE DATABASE
-- ============================================
DROP SCHEMA IF EXISTS `flight_service_db`;
CREATE SCHEMA IF NOT EXISTS `flight_service_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `flight_service_db`;

-- Table Aircrafts - Quản lý thông tin các loại máy bay
CREATE TABLE Aircrafts (
    AircraftID INT AUTO_INCREMENT PRIMARY KEY,
    Model VARCHAR(100) NOT NULL COMMENT 'Tên model máy bay (vd: Boeing 737)',
    Manufacturer VARCHAR(100) NOT NULL COMMENT 'Nhà sản xuất (vd: Boeing, Airbus)',
    Capacity INT NOT NULL COMMENT 'Sức chứa tổng số ghế',
    RangeKm INT NOT NULL COMMENT 'Tầm bay tối đa (km)',
    Description TEXT COMMENT 'Mô tả chi tiết về máy bay',
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_model (Model),
    INDEX idx_manufacturer (Manufacturer)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
COMMENT='Flight Service Database - Owns aircraft data';

-- Table Flights - Quản lý các chuyến bay
CREATE TABLE Flights (
    FlightID INT AUTO_INCREMENT PRIMARY KEY,
    AircraftTypeID INT NOT NULL COMMENT 'FK nội bộ tới Aircrafts trong cùng DB',
    Departure VARCHAR(100) NOT NULL COMMENT 'Điểm khởi hành',
    Arrival VARCHAR(100) NOT NULL COMMENT 'Điểm đến',
    DepartureTime DATETIME NOT NULL COMMENT 'Thời gian khởi hành',
    ArrivalTime DATETIME NOT NULL COMMENT 'Thời gian đến',
    Price DECIMAL(10, 2) NOT NULL COMMENT 'Giá vé',
    SeatsAvailable INT NOT NULL COMMENT 'Số ghế còn trống',
    Status ENUM('scheduled', 'on-time', 'delayed', 'cancelled') DEFAULT 'scheduled' COMMENT 'Trạng thái chuyến bay',
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (AircraftTypeID) REFERENCES Aircrafts(AircraftID) ON DELETE RESTRICT,
    INDEX idx_departure_arrival (Departure, Arrival),
    INDEX idx_departure_time (DepartureTime),
    INDEX idx_status (Status),
    INDEX idx_seats_available (SeatsAvailable)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
COMMENT='Flight Service Database - Owns flight data';

-- Sample Aircrafts
INSERT INTO Aircrafts (Model, Manufacturer, Capacity, RangeKm, Description)
VALUES
    ('Boeing 737', 'Boeing', 160, 5000, 'A short to medium range aircraft with 160 seats.'),
    ('Airbus A320', 'Airbus', 180, 6000, 'A popular medium-range airliner with 180 seats.'),
    ('Boeing 787', 'Boeing', 250, 15000, 'A long-haul aircraft with modern amenities and 250 seats.'),
    ('Airbus A350', 'Airbus', 300, 16000, 'A long-haul, wide-body aircraft with 300 seats.'),
    ('Boeing 747', 'Boeing', 400, 12000, 'A large aircraft with 400 seats, suitable for long-haul flights.'),
    ('Airbus A380', 'Airbus', 850, 15200, 'The largest commercial aircraft, suitable for high-capacity, long-haul flights.'),
    ('Embraer E190', 'Embraer', 100, 3700, 'A regional jet used for short to medium-haul routes.'),
    ('Bombardier CRJ900', 'Bombardier', 90, 3300, 'A regional jet typically used for short-haul flights.');

-- Sample Flights
INSERT INTO Flights (AircraftTypeID, Departure, Arrival, DepartureTime, ArrivalTime, Price, SeatsAvailable, Status)
VALUES
    (1, 'New York', 'Los Angeles', '2025-12-10 08:00:00', '2025-12-10 11:30:00', 250.00, 160, 'scheduled'),
    (2, 'San Francisco', 'Chicago', '2025-12-12 14:00:00', '2025-12-12 19:00:00', 200.00, 180, 'scheduled'),
    (2, 'Chicago', 'London', '2025-12-15 21:00:00', '2025-12-16 09:00:00', 800.00, 200, 'scheduled'),
    (3, 'Dubai', 'Paris', '2025-12-20 22:00:00', '2025-12-21 07:00:00', 1000.00, 250, 'on-time'),
    (6, 'Doha', 'Sydney', '2025-12-22 12:00:00', '2025-12-23 06:00:00', 1200.00, 350, 'on-time'),
    (1, 'Ho Chi Minh City', 'Hanoi', '2025-11-15 06:00:00', '2025-11-15 08:30:00', 150.00, 160, 'scheduled'),
    (2, 'Hanoi', 'Da Nang', '2025-11-16 09:00:00', '2025-11-16 10:30:00', 120.00, 180, 'scheduled'),
    (3, 'Ho Chi Minh City', 'Singapore', '2025-11-17 15:00:00', '2025-11-17 17:30:00', 350.00, 250, 'scheduled');

SELECT '✅ Flight Service Database created successfully!' AS Status;

-- ============================================
-- 3. BOOKING SERVICE DATABASE
-- ============================================
DROP SCHEMA IF EXISTS `booking_service_db`;
CREATE SCHEMA IF NOT EXISTS `booking_service_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `booking_service_db`;

-- Table Bookings - Quản lý đặt vé
-- ⚠️ QUAN TRỌNG: UserID và FlightID là reference IDs, KHÔNG CÓ FOREIGN KEY
-- Vì Users và Flights nằm ở databases khác!
CREATE TABLE Bookings (
    BookingID INT AUTO_INCREMENT PRIMARY KEY,
    UserID INT NOT NULL COMMENT 'Reference tới Users trong user_service_db (NO FK)',
    FlightID INT NOT NULL COMMENT 'Reference tới Flights trong flight_service_db (NO FK)',
    BookingStatus ENUM('confirmed', 'cancelled', 'pending') DEFAULT 'pending' COMMENT 'Trạng thái booking',
    PaymentStatus ENUM('paid', 'unpaid', 'refunded') DEFAULT 'unpaid' COMMENT 'Trạng thái thanh toán',
    BookingDate DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời gian đặt vé',
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (UserID),
    INDEX idx_flight_id (FlightID),
    INDEX idx_booking_status (BookingStatus),
    INDEX idx_payment_status (PaymentStatus)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
COMMENT='Booking Service Database - Owns booking data';

-- Table Payments - Quản lý thanh toán
CREATE TABLE Payments (
    PaymentID INT AUTO_INCREMENT PRIMARY KEY,
    BookingID INT UNIQUE NOT NULL COMMENT 'FK nội bộ tới Bookings trong cùng DB',
    Amount DECIMAL(10, 2) NOT NULL COMMENT 'Số tiền thanh toán',
    PaymentMethod VARCHAR(50) COMMENT 'Phương thức thanh toán (credit card, paypal, etc)',
    TransactionID VARCHAR(100) COMMENT 'Mã giao dịch từ payment gateway',
    PaymentDate DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời gian thanh toán',
    PaymentStatus ENUM('completed', 'pending', 'failed', 'refunded') DEFAULT 'pending' COMMENT 'Trạng thái thanh toán',
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (BookingID) REFERENCES Bookings(BookingID) ON DELETE CASCADE,
    INDEX idx_payment_status (PaymentStatus),
    INDEX idx_payment_date (PaymentDate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
COMMENT='Booking Service Database - Owns payment data';

-- Sample Bookings
INSERT INTO Bookings (UserID, FlightID, BookingStatus, PaymentStatus, BookingDate)
VALUES
    (1, 1, 'confirmed', 'paid', '2025-11-01 10:00:00'),
    (1, 2, 'pending', 'unpaid', '2025-11-02 14:30:00'),
    (2, 3, 'cancelled', 'refunded', '2025-11-05 16:00:00'),
    (3, 4, 'confirmed', 'paid', '2025-11-07 18:30:00'),
    (4, 5, 'confirmed', 'unpaid', '2025-11-09 09:00:00'),
    (5, 6, 'confirmed', 'paid', '2025-11-10 11:00:00');

-- Sample Payments
INSERT INTO Payments (BookingID, Amount, PaymentMethod, TransactionID, PaymentDate, PaymentStatus)
VALUES
    (1, 250.00, 'credit_card', 'TXN001', '2025-11-01 10:05:00', 'completed'),
    (2, 200.00, 'credit_card', 'TXN002', '2025-11-02 15:00:00', 'pending'),
    (3, 800.00, 'paypal', 'TXN003', '2025-11-05 16:30:00', 'refunded'),
    (4, 1000.00, 'credit_card', 'TXN004', '2025-11-07 19:00:00', 'completed'),
    (6, 150.00, 'credit_card', 'TXN006', '2025-11-10 11:05:00', 'completed');

SELECT '✅ Booking Service Database created successfully!' AS Status;

-- ============================================
-- 4. OFFER SERVICE DATABASE
-- ============================================
DROP SCHEMA IF EXISTS `offer_service_db`;
CREATE SCHEMA IF NOT EXISTS `offer_service_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `offer_service_db`;

-- Table Offers - Quản lý khuyến mãi và tin tức
CREATE TABLE Offers (
    PostID INT AUTO_INCREMENT PRIMARY KEY,
    Title VARCHAR(255) NOT NULL COMMENT 'Tiêu đề offer/news',
    Content TEXT NOT NULL COMMENT 'Nội dung chi tiết',
    PostDate DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời gian đăng',
    Type ENUM('promotion', 'news') DEFAULT 'promotion' COMMENT 'Loại: khuyến mãi hoặc tin tức',
    IsActive BOOLEAN DEFAULT TRUE COMMENT 'Trạng thái active/inactive',
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_type (Type),
    INDEX idx_is_active (IsActive),
    INDEX idx_post_date (PostDate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
COMMENT='Offer Service Database - Owns offer data';

-- Sample Offers
INSERT INTO Offers (Title, Content, PostDate, Type, IsActive)
VALUES
    ('Holiday Sale', 'Get 20% off on all flights this holiday season! Book now and save big on your next adventure.', '2025-11-01 12:00:00', 'promotion', TRUE),
    ('New Route Announcement', 'We are excited to announce new routes from Ho Chi Minh City to Singapore and Bangkok!', '2025-11-10 08:00:00', 'news', TRUE),
    ('Black Friday Special', 'Incredible Black Friday deals! Up to 50% off on international flights. Limited time only!', '2025-11-20 00:00:00', 'promotion', TRUE),
    ('Travel Safety Update', 'Important updates on our enhanced safety measures and travel guidelines.', '2025-11-05 10:00:00', 'news', TRUE),
    ('Summer Sale Coming Soon', 'Get ready for our biggest summer sale! Stay tuned for amazing deals.', '2025-11-15 14:00:00', 'promotion', FALSE);

SELECT '✅ Offer Service Database created successfully!' AS Status;

-- ============================================
-- 5. VERIFICATION
-- ============================================
SELECT '=====================================' AS separator_line;
SELECT '✨ ALL DATABASES CREATED SUCCESSFULLY!' AS Status;
SELECT '=====================================' AS separator_line;

-- Kiểm tra số lượng records
USE user_service_db;
SELECT 'user_service_db' AS db_name, 'Users' AS table_name, COUNT(*) AS record_count FROM Users;

USE flight_service_db;
SELECT 'flight_service_db' AS db_name, 'Aircrafts' AS table_name, COUNT(*) AS RecordCount FROM Aircrafts
UNION ALL
SELECT 'flight_service_db', 'Flights', COUNT(*) FROM Flights;

USE booking_service_db;
SELECT 'booking_service_db' AS db_name, 'Bookings' AS table_name, COUNT(*) AS RecordCount FROM Bookings
UNION ALL
SELECT 'booking_service_db', 'Payments', COUNT(*) FROM Payments;

USE offer_service_db;
SELECT 'offer_service_db' AS db_name, 'Offers' AS table_name, COUNT(*) AS RecordCount FROM Offers;

-- ============================================
-- NOTES
-- ============================================
-- ⚠️ QUAN TRỌNG:
-- 1. Mỗi service có DATABASE RIÊNG BIỆT
-- 2. KHÔNG có Foreign Keys giữa databases
-- 3. Data consistency được đảm bảo bằng:
--    - Service-to-service API calls
--    - Saga pattern cho distributed transactions
--    - Event-driven architecture
-- 4. Mỗi service CHỊU TRÁCH NHIỆM cho data của riêng nó
-- 5. Cần implement validation và error handling cẩn thận
-- ============================================
SHOW DATABASES;
use user_service_db;
INSERT INTO Users (Name, Username, Email, Password, Role)
VALUES ('Admin','admin123','admin123@qairline.com','$2b$10$wYT7BdG717HqkDxyF1kg1.4Fhc.AgwMdkTQ00iPo4zZmzWiZC0XNu','Admin');
