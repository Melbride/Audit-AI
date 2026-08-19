/**
 * Custom Date Input Component for Audit AI
 * 
 * This component provides a date input that:
 * - Displays dates in YY/MM/DD format
 * - Validates dates using the centralized date validation system
 * - Provides meaningful error messages
 * - Supports different date contexts (financial period vs system event)
 */

import React, { useState, useEffect } from 'react';
import {
  isValidCalendarDate,
  convertDisplayToStorage,
  convertStorageToDisplay,
  validateDateContext,
  DateContext
} from '../utils/dateValidation';

function DateInput({
  value,
  onChange,
  placeholder = 'YY/MM/DD',
  context = DateContext.GENERAL,
  disabled = false,
  required = false,
  className = '',
  label = '',
  error = '',
  onErrorChange = null,
  minDate = null,
  maxDate = null
}) {
  const [inputValue, setInputValue] = useState('');
  const [validationError, setValidationError] = useState('');
  const [isTouched, setIsTouched] = useState(false);

  // Initialize input value from storage format
  useEffect(() => {
    if (value) {
      const displayValue = convertStorageToDisplay(value);
      setInputValue(displayValue || '');
    } else {
      setInputValue('');
    }
  }, [value]);

  // Update error state when external error changes
  useEffect(() => {
    if (error !== undefined) {
      setValidationError(error);
    }
  }, [error]);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setIsTouched(true);

    // Auto-format as user types (basic YY/MM/DD formatting)
    let formattedValue = newValue;
    
    // Remove non-numeric characters except slashes
    formattedValue = formattedValue.replace(/[^\d/]/g, '');
    
    // Add slashes automatically
    const parts = formattedValue.split('/');
    if (parts.length === 1 && parts[0].length >= 2) {
      formattedValue = parts[0].slice(0, 2) + '/' + parts[0].slice(2);
    } else if (parts.length === 2 && parts[1].length >= 2) {
      formattedValue = parts[0] + '/' + parts[1].slice(0, 2) + '/' + parts[1].slice(2);
    } else if (parts.length === 3) {
      formattedValue = parts[0] + '/' + parts[1].slice(0, 2) + '/' + parts[2].slice(0, 2);
    }

    // Limit length
    if (formattedValue.length > 8) {
      formattedValue = formattedValue.slice(0, 8);
    }

    setInputValue(formattedValue);

    // Validate the input
    if (formattedValue.length === 8) { // Complete YY/MM/DD format
      const validation = isValidCalendarDate(formattedValue, 'display');
      if (!validation.isValid) {
        setValidationError(validation.errorMessage);
        if (onErrorChange) onErrorChange(validation.errorMessage);
      } else {
        // Additional context validation
        const contextValidation = validateDateContext(formattedValue, context, null, 'display');
        if (!contextValidation.isValid) {
          setValidationError(contextValidation.errorMessage);
          if (onErrorChange) onErrorChange(contextValidation.errorMessage);
        } else {
          setValidationError('');
          if (onErrorChange) onErrorChange('');
          
          // Convert to storage format and call onChange
          const storageValue = convertDisplayToStorage(formattedValue);
          if (storageValue) {
            onChange(storageValue);
          }
        }
      }
    } else if (formattedValue.length === 0 && !required) {
      setValidationError('');
      if (onErrorChange) onErrorChange('');
      onChange('');
    } else {
      // Clear error for incomplete input
      setValidationError('');
      if (onErrorChange) onErrorChange('');
    }
  };

  const handleBlur = () => {
    setIsTouched(true);
    
    // Final validation on blur
    if (inputValue.length > 0 && inputValue.length !== 8) {
      setValidationError('Please enter a valid date in YY/MM/DD format');
      if (onErrorChange) onErrorChange('Please enter a valid date in YY/MM/DD format');
    }
  };

  const displayError = isTouched ? validationError : error;

  return (
    <div className="date-input-container">
      {label && <label className="date-input-label">{label}{required && ' *'}</label>}
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={`date-input ${className} ${displayError ? 'date-input-error' : ''}`}
        maxLength={8}
      />
      {displayError && <div className="date-input-error-message">{displayError}</div>}
    </div>
  );
}

export default DateInput;