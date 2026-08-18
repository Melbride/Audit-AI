/**
 * Centralized Date Validation System for Audit AI (Frontend)
 * 
 * This module provides comprehensive date validation utilities including:
 * - YY/MM/DD format parsing and display
 * - Real calendar date validation
 * - Date range validation (start <= end)
 * - Context-aware validation (financial vs system event dates)
 * - Meaningful error messages
 * 
 * These utilities mirror the backend date_validator.py logic for consistency.
 */

// Date context types (matching backend DateContext enum)
const DateContext = {
  FINANCIAL_PERIOD: 'financial_period',  // Engagement financial/audit period - future dates allowed
  SYSTEM_EVENT: 'system_event',          // Submission, approval, report generation - should reflect actual events
  GENERAL: 'general'                     // General date fields with standard validation
};

// Format constants
const DISPLAY_FORMAT = 'YY/MM/DD';  // YY/MM/DD
const STORAGE_FORMAT = 'YYYY-MM-DD'; // YYYY-MM-DD (database format)

/**
 * Parse a date string in YY/MM/DD format to a Date object.
 * @param {string} dateString - Date string in YY/MM/DD format (e.g., "26/08/14")
 * @returns {Date|null} Date object if valid, null if invalid
 * @throws {Error} If format is invalid
 */
function parseDisplayFormat(dateString) {
  if (!dateString || typeof dateString !== 'string') {
    return null;
  }

  const parts = dateString.trim().split('/');
  if (parts.length !== 3) {
    throw new Error(`Please enter a valid date in YY/MM/DD format. Received: '${dateString}'`);
  }

  const [year, month, day] = parts.map(Number);

  // Validate components
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    throw new Error(`Please enter a valid date in YY/MM/DD format. Received: '${dateString}'`);
  }

  // Convert YY to full year (assuming 2000-2099)
  const fullYear = 2000 + year;

  // Create date object and validate
  const date = new Date(fullYear, month - 1, day);

  // Check if the date is valid (accounts for invalid dates like Feb 30)
  if (
    date.getFullYear() !== fullYear ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error('The selected date is not a valid calendar date');
  }

  // Additional validation for year
  if (fullYear < 2000) {
    throw new Error('Year must be 2000 or later (YY format: 00 or greater)');
  }

  return date;
}

/**
 * Parse a date string in YYYY-MM-DD format (database format) to a Date object.
 * @param {string} dateString - Date string in YYYY-MM-DD format (e.g., "2026-08-14")
 * @returns {Date|null} Date object if valid, null if invalid
 */
function parseStorageFormat(dateString) {
  if (!dateString || typeof dateString !== 'string') {
    return null;
  }

  const parts = dateString.trim().split('-');
  if (parts.length !== 3) {
    return null;
  }

  const [year, month, day] = parts.map(Number);

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return null;
  }

  const date = new Date(year, month - 1, day);

  // Check if the date is valid
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

/**
 * Format a Date object to YY/MM/DD display format.
 * @param {Date} dateObj - Date object
 * @returns {string} String in YY/MM/DD format (e.g., "26/08/14")
 */
function formatToDisplay(dateObj) {
  if (!(dateObj instanceof Date) || isNaN(dateObj)) {
    return '';
  }

  const year = dateObj.getFullYear() % 100; // Get last 2 digits
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');

  return `${year}/${month}/${day}`;
}

/**
 * Format a Date object to YYYY-MM-DD storage format.
 * @param {Date} dateObj - Date object
 * @returns {string} String in YYYY-MM-DD format (e.g., "2026-08-14")
 */
function formatToStorage(dateObj) {
  if (!(dateObj instanceof Date) || isNaN(dateObj)) {
    return '';
  }

  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Convert a date string from YY/MM/DD display format to YYYY-MM-DD storage format.
 * @param {string} dateString - Date string in YY/MM/DD format
 * @returns {string|null} String in YYYY-MM-DD format, or null if invalid
 */
function convertDisplayToStorage(dateString) {
  try {
    const dateObj = parseDisplayFormat(dateString);
    if (dateObj) {
      return formatToStorage(dateObj);
    }
  } catch (error) {
    return null;
  }
  return null;
}

/**
 * Convert a date string from YYYY-MM-DD storage format to YY/MM/DD display format.
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {string|null} String in YY/MM/DD format, or null if invalid
 */
function convertStorageToDisplay(dateString) {
  const dateObj = parseStorageFormat(dateString);
  if (dateObj) {
    return formatToDisplay(dateObj);
  }
  return null;
}

/**
 * Validate if a date string represents a real calendar date.
 * This checks for impossible dates like:
 * - 26/02/30 (February 30th doesn't exist)
 * - 26/13/01 (Month 13 doesn't exist)
 * - 26/00/10 (Month 00 doesn't exist)
 * - 00/01/01 (Year 00 is invalid)
 * 
 * @param {string} dateString - Date string to validate
 * @param {string} inputFormat - "display" for YY/MM/DD, "storage" for YYYY-MM-DD
 * @returns {Object} Object with isValid (boolean) and errorMessage (string|null)
 */
function isValidCalendarDate(dateString, inputFormat = 'display') {
  if (!dateString || typeof dateString !== 'string') {
    return { isValid: false, errorMessage: 'Date cannot be empty' };
  }

  try {
    if (inputFormat === 'display') {
      parseDisplayFormat(dateString);
    } else {
      const dateObj = parseStorageFormat(dateString);
      if (!dateObj) {
        return { isValid: false, errorMessage: 'Please enter a valid date' };
      }
    }
    return { isValid: true, errorMessage: null };
  } catch (error) {
    return { isValid: false, errorMessage: error.message };
  }
}

/**
 * Validate that start date is not after end date.
 * @param {string} startDate - Start date string
 * @param {string} endDate - End date string
 * @param {string} inputFormat - "display" for YY/MM/DD, "storage" for YYYY-MM-DD
 * @returns {Object} Object with isValid (boolean) and errorMessage (string|null)
 */
function validateDateRange(startDate, endDate, inputFormat = 'display') {
  if (!startDate || !endDate) {
    return { isValid: true, errorMessage: null }; // If either is empty, range validation doesn't apply
  }

  try {
    const start = inputFormat === 'display' ? parseDisplayFormat(startDate) : parseStorageFormat(startDate);
    const end = inputFormat === 'display' ? parseDisplayFormat(endDate) : parseStorageFormat(endDate);

    if (!start || !end) {
      return { isValid: false, errorMessage: 'Both dates must be valid for range validation' };
    }

    if (start > end) {
      return { isValid: false, errorMessage: 'The start date cannot be later than the end date' };
    }

    return { isValid: true, errorMessage: null };
  } catch (error) {
    return { isValid: false, errorMessage: error.message };
  }
}

/**
 * Validate a date based on its context/meaning.
 * @param {string} dateString - Date string to validate
 * @param {string} context - DateContext value indicating the type of date field
 * @param {Date} referenceDate - Optional reference date for relative validation
 * @param {string} inputFormat - "display" for YY/MM/DD, "storage" for YYYY-MM-DD
 * @returns {Object} Object with isValid (boolean) and errorMessage (string|null)
 */
function validateDateContext(dateString, context, referenceDate = null, inputFormat = 'display') {
  // First validate it's a real calendar date
  const calendarValidation = isValidCalendarDate(dateString, inputFormat);
  if (!calendarValidation.isValid) {
    return calendarValidation;
  }

  try {
    const dateObj = inputFormat === 'display' ? parseDisplayFormat(dateString) : parseStorageFormat(dateString);
    if (!dateObj) {
      return { isValid: false, errorMessage: 'Invalid date' };
    }

    const currentDate = referenceDate || new Date();

    // Context-specific validation
    if (context === DateContext.FINANCIAL_PERIOD) {
      // Financial periods can be future dates - no additional validation needed
      return { isValid: true, errorMessage: null };
    } else if (context === DateContext.SYSTEM_EVENT) {
      // System events (submission, approval, report generation) should generally be present or past
      // However, we allow some flexibility for scheduling
      // Only reject if date is unreasonably far in future (more than 1 year)
      if (dateObj > currentDate) {
        const yearsDiff = (dateObj - currentDate) / (365 * 24 * 60 * 60 * 1000);
        if (yearsDiff > 1) {
          return { isValid: false, errorMessage: 'This date cannot be more than 1 year in the future for system events' };
        }
      }
      return { isValid: true, errorMessage: null };
    } else if (context === DateContext.GENERAL) {
      // General validation - no specific future date restrictions
      return { isValid: true, errorMessage: null };
    }

    return { isValid: true, errorMessage: null };
  } catch (error) {
    return { isValid: false, errorMessage: error.message };
  }
}

/**
 * Validate engagement financial period dates.
 * Engagement dates can be future periods, so we only validate:
 * 1. Both are valid calendar dates
 * 2. Start date <= end date
 * 
 * @param {string} startDate - Start date string
 * @param {string} endDate - End date string
 * @param {string} inputFormat - "display" for YY/MM/DD, "storage" for YYYY-MM-DD
 * @returns {Object} Object with isValid (boolean) and errorMessage (string|null)
 */
function validateEngagementDates(startDate, endDate, inputFormat = 'display') {
  // Validate individual dates as financial period (allows future)
  const startValidation = validateDateContext(startDate, DateContext.FINANCIAL_PERIOD, null, inputFormat);
  if (!startValidation.isValid) {
    return { isValid: false, errorMessage: `Start date: ${startValidation.errorMessage}` };
  }

  const endValidation = validateDateContext(endDate, DateContext.FINANCIAL_PERIOD, null, inputFormat);
  if (!endValidation.isValid) {
    return { isValid: false, errorMessage: `End date: ${endValidation.errorMessage}` };
  }

  // Validate date range
  return validateDateRange(startDate, endDate, inputFormat);
}

/**
 * Validate a system event date (submission, approval, report generation).
 * @param {string} dateString - Date string to validate
 * @param {Date} referenceDate - Optional reference date for relative validation
 * @param {string} inputFormat - "display" for YY/MM/DD, "storage" for YYYY-MM-DD
 * @returns {Object} Object with isValid (boolean) and errorMessage (string|null)
 */
function validateSystemEventDate(dateString, referenceDate = null, inputFormat = 'display') {
  return validateDateContext(dateString, DateContext.SYSTEM_EVENT, referenceDate, inputFormat);
}

/**
 * Convenience function for validating a single date input.
 * @param {string} dateString - Date string to validate
 * @param {string} context - DateContext for validation rules
 * @param {string} inputFormat - "display" for YY/MM/DD, "storage" for YYYY-MM-DD
 * @returns {Object} Object with isValid (boolean) and errorMessage (string|null)
 */
function validateDateInput(dateString, context = DateContext.GENERAL, inputFormat = 'display') {
  return validateDateContext(dateString, context, null, inputFormat);
}

/**
 * Convenience function for validating a date pair (start/end).
 * @param {string} startDate - Start date string
 * @param {string} endDate - End date string
 * @param {string} context - DateContext for validation rules
 * @param {string} inputFormat - "display" for YY/MM/DD, "storage" for YYYY-MM-DD
 * @returns {Object} Object with isValid (boolean) and errorMessage (string|null)
 */
function validateDatePair(startDate, endDate, context = DateContext.GENERAL, inputFormat = 'display') {
  // Validate individual dates
  const startValidation = validateDateInput(startDate, context, inputFormat);
  if (!startValidation.isValid) {
    return { isValid: false, errorMessage: `Start date: ${startValidation.errorMessage}` };
  }

  const endValidation = validateDateInput(endDate, context, inputFormat);
  if (!endValidation.isValid) {
    return { isValid: false, errorMessage: `End date: ${endValidation.errorMessage}` };
  }

  // Validate range
  return validateDateRange(startDate, endDate, inputFormat);
}

// Export all functions and constants
export {
  DateContext,
  DISPLAY_FORMAT,
  STORAGE_FORMAT,
  parseDisplayFormat,
  parseStorageFormat,
  formatToDisplay,
  formatToStorage,
  convertDisplayToStorage,
  convertStorageToDisplay,
  isValidCalendarDate,
  validateDateRange,
  validateDateContext,
  validateEngagementDates,
  validateSystemEventDate,
  validateDateInput,
  validateDatePair
};