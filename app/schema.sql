-- Vipra Realty — MySQL schema
-- Import this once via hPanel → phpMyAdmin → Import, into your database.
SET NAMES utf8mb4;
SET time_zone = '+05:30';

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('master','sub') NOT NULL DEFAULT 'sub',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sub_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  name VARCHAR(80) NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS properties (
  id INT AUTO_INCREMENT PRIMARY KEY,
  builder_name VARCHAR(190) NULL,
  project_title VARCHAR(190) NULL,
  building_name VARCHAR(190) NULL,
  description TEXT NULL,
  search_type ENUM('Rent','Buy') NOT NULL,
  listing_type ENUM('Resale','Under Construction','') NOT NULL DEFAULT '',
  category_id INT NULL,
  sub_category_id INT NULL,
  city VARCHAR(80) NULL,
  locality VARCHAR(190) NULL,
  sale_price BIGINT NULL,
  monthly_rent BIGINT NULL,
  deposit_amount BIGINT NULL,
  down_payment BIGINT NULL,
  possession_date VARCHAR(40) NULL,
  bedrooms INT NULL,
  bathrooms INT NULL,
  carpet_area INT NULL,
  builtup_area INT NULL,
  total_floors INT NULL,
  floor_no INT NULL,
  ceiling_height VARCHAR(20) NULL,
  status ENUM('active','inactive','sold_out','rented_out') NOT NULL DEFAULT 'active',
  featured TINYINT(1) NOT NULL DEFAULT 0,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (status), INDEX (search_type), INDEX (city)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS property_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  property_id INT NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS enquiries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  property_id INT NULL,
  name VARCHAR(190) NOT NULL,
  mobile VARCHAR(15) NOT NULL,
  requirement TEXT NULL,
  otp_verified TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS otp_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mobile VARCHAR(15) NOT NULL,
  otp VARCHAR(6) NOT NULL,
  issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at DATETIME NULL,
  result ENUM('issued','verified','failed') NOT NULL DEFAULT 'issued'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS import_batches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NULL,
  rows_total INT NOT NULL DEFAULT 0,
  rows_ok INT NOT NULL DEFAULT 0,
  rows_failed INT NOT NULL DEFAULT 0,
  errors TEXT NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed the category tree
INSERT INTO categories (name) VALUES ('Residential'), ('Commercial');
INSERT INTO sub_categories (category_id, name) VALUES
 (1,'Flats'),(1,'Villas'),(1,'Independent House'),(1,'Independent Plots'),
 (2,'Office Space'),(2,'Retail Store'),(2,'Warehouse'),(2,'Land'),(2,'Others');

-- The master user is NOT seeded here. After importing this schema, open
--   https://www.viprarealty.com/admin/install.php
-- once to create the master account, then DELETE install.php.
