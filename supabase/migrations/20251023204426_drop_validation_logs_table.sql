/*
  # Remove validation_logs table

  This migration removes the validation_logs table as validation logging
  has been removed from the application.

  1. Changes
    - Drop `validation_logs` table completely
*/

DROP TABLE IF EXISTS validation_logs;