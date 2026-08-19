

from datetime import datetime, date
from typing import Optional, Tuple, Literal
from enum import Enum


class DateContext(Enum):
    """Defines the context/type of date field for validation rules"""
    FINANCIAL_PERIOD = "financial_period"  # Engagement financial/audit period - future dates allowed
    SYSTEM_EVENT = "system_event"  # Submission, approval, report generation - should reflect actual events
    GENERAL = "general"  # General date fields with standard validation


class DateValidationError(Exception):
    """Custom exception for date validation errors with meaningful messages"""
    def __init__(self, message: str):
        self.message = message
        super().__init__(self.message)


class DateValidator:
    """
    Centralized date validation utility for Audit AI application.
    
    Provides methods for:
    - Parsing and formatting dates in YY/MM/DD format
    - Validating real calendar dates
    - Validating date ranges
    - Context-aware validation based on date meaning
    """
    
    # Format constants
    DISPLAY_FORMAT = "%y/%m/%d"  # YY/MM/DD
    STORAGE_FORMAT = "%Y-%m-%d"  # YYYY-MM-DD (database format)
    
    @staticmethod
    def parse_display_format(date_string: str) -> Optional[date]:
        """
        Parse a date string in YY/MM/DD format to a date object.
        
        Args:
            date_string: Date string in YY/MM/DD format (e.g., "26/08/14")
            
        Returns:
            date object if valid, None if invalid
            
        Raises:
            DateValidationError: If format is invalid
        """
        if not date_string or not isinstance(date_string, str):
            return None
        
        try:
            parsed_date = datetime.strptime(date_string.strip(), DateValidator.DISPLAY_FORMAT).date()
            return parsed_date
        except ValueError:
            raise DateValidationError(
                f"Please enter a valid date in YY/MM/DD format. Received: '{date_string}'"
            )
    
    @staticmethod
    def parse_storage_format(date_string: str) -> Optional[date]:
        """
        Parse a date string in YYYY-MM-DD format (database format) to a date object.
        
        Args:
            date_string: Date string in YYYY-MM-DD format (e.g., "2026-08-14")
            
        Returns:
            date object if valid, None if invalid
        """
        if not date_string or not isinstance(date_string, str):
            return None
        
        try:
            parsed_date = datetime.strptime(date_string.strip(), DateValidator.STORAGE_FORMAT).date()
            return parsed_date
        except ValueError:
            return None
    
    @staticmethod
    def format_to_display(date_obj: date) -> str:
        """
        Format a date object to YY/MM/DD display format.
        
        Args:
            date_obj: date object
            
        Returns:
            String in YY/MM/DD format (e.g., "26/08/14")
        """
        return date_obj.strftime(DateValidator.DISPLAY_FORMAT)
    
    @staticmethod
    def format_to_storage(date_obj: date) -> str:
        """
        Format a date object to YYYY-MM-DD storage format.
        
        Args:
            date_obj: date object
            
        Returns:
            String in YYYY-MM-DD format (e.g., "2026-08-14")
        """
        return date_obj.strftime(DateValidator.STORAGE_FORMAT)
    
    @staticmethod
    def convert_display_to_storage(date_string: str) -> Optional[str]:
        """
        Convert a date string from YY/MM/DD display format to YYYY-MM-DD storage format.
        
        Args:
            date_string: Date string in YY/MM/DD format
            
        Returns:
            String in YYYY-MM-DD format, or None if invalid
        """
        try:
            date_obj = DateValidator.parse_display_format(date_string)
            if date_obj:
                return DateValidator.format_to_storage(date_obj)
        except DateValidationError:
            return None
        return None
    
    @staticmethod
    def convert_storage_to_display(date_string: str) -> Optional[str]:
        """
        Convert a date string from YYYY-MM-DD storage format to YY/MM/DD display format.
        
        Args:
            date_string: Date string in YYYY-MM-DD format
            
        Returns:
            String in YY/MM/DD format, or None if invalid
        """
        date_obj = DateValidator.parse_storage_format(date_string)
        if date_obj:
            return DateValidator.format_to_display(date_obj)
        return None
    
    @staticmethod
    def is_valid_calendar_date(date_string: str, input_format: Literal["display", "storage"] = "display") -> Tuple[bool, Optional[str]]:
        """
        Validate if a date string represents a real calendar date.
        
        This checks for impossible dates like:
        - 26/02/30 (February 30th doesn't exist)
        - 26/13/01 (Month 13 doesn't exist)
        - 26/00/10 (Month 00 doesn't exist)
        - 00/01/01 (Year 00 is invalid)
        
        Args:
            date_string: Date string to validate
            input_format: "display" for YY/MM/DD, "storage" for YYYY-MM-DD
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not date_string or not isinstance(date_string, str):
            return False, "Date cannot be empty"
        
        try:
            if input_format == "display":
                date_obj = DateValidator.parse_display_format(date_string)
            else:
                date_obj = DateValidator.parse_storage_format(date_string)
            
            if date_obj is None:
                return False, "Please enter a valid date"
            
            # Additional validation for year
            if date_obj.year < 2000:
                return False, "Year must be 2000 or later (YY format: 00 or greater)"
            
            return True, None
            
        except DateValidationError as e:
            return False, e.message
        except ValueError:
            return False, "The selected date is not a valid calendar date"
    
    @staticmethod
    def validate_date_range(start_date: str, end_date: str, 
                           input_format: Literal["display", "storage"] = "display") -> Tuple[bool, Optional[str]]:
        """
        Validate that start date is not after end date.
        
        Args:
            start_date: Start date string
            end_date: End date string
            input_format: "display" for YY/MM/DD, "storage" for YYYY-MM-DD
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not start_date or not end_date:
            return True, None  # If either is empty, range validation doesn't apply
        
        try:
            if input_format == "display":
                start = DateValidator.parse_display_format(start_date)
                end = DateValidator.parse_display_format(end_date)
            else:
                start = DateValidator.parse_storage_format(start_date)
                end = DateValidator.parse_storage_format(end_date)
            
            if start is None or end is None:
                return False, "Both dates must be valid for range validation"
            
            if start > end:
                return False, "The start date cannot be later than the end date"
            
            return True, None
            
        except DateValidationError as e:
            return False, e.message
    
    @staticmethod
    def validate_date_context(date_string: str, context: DateContext, 
                             reference_date: Optional[date] = None,
                             input_format: Literal["display", "storage"] = "display") -> Tuple[bool, Optional[str]]:
        """
        Validate a date based on its context/meaning.
        
        Args:
            date_string: Date string to validate
            context: DateContext enum indicating the type of date field
            reference_date: Optional reference date for relative validation
            input_format: "display" for YY/MM/DD, "storage" for YYYY-MM-DD
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        # First validate it's a real calendar date
        is_valid, error_msg = DateValidator.is_valid_calendar_date(date_string, input_format)
        if not is_valid:
            return False, error_msg
        
        try:
            if input_format == "display":
                date_obj = DateValidator.parse_display_format(date_string)
            else:
                date_obj = DateValidator.parse_storage_format(date_string)
            
            if date_obj is None:
                return False, "Invalid date"
            
            current_date = reference_date if reference_date else date.today()
            
            # Context-specific validation
            if context == DateContext.FINANCIAL_PERIOD:
                # Financial periods can be future dates - no additional validation needed
                return True, None
                
            elif context == DateContext.SYSTEM_EVENT:
                # System events (submission, approval, report generation) should generally be present or past
                # However, we allow some flexibility for scheduling
                # Only reject if date is unreasonably far in future (more than 1 year)
                if date_obj > current_date:
                    years_diff = (date_obj - current_date).days / 365
                    if years_diff > 1:
                        return False, "This date cannot be more than 1 year in the future for system events"
                return True, None
                
            elif context == DateContext.GENERAL:
                # General validation - no specific future date restrictions
                return True, None
                
            return True, None
            
        except DateValidationError as e:
            return False, e.message
    
    @staticmethod
    def validate_engagement_dates(start_date: str, end_date: str,
                                  input_format: Literal["display", "storage"] = "display") -> Tuple[bool, Optional[str]]:
        """
        Validate engagement financial period dates.
        
        Engagement dates can be future periods, so we only validate:
        1. Both are valid calendar dates
        2. Start date <= end date
        
        Args:
            start_date: Start date string
            end_date: End date string
            input_format: "display" for YY/MM/DD, "storage" for YYYY-MM-DD
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        # Validate individual dates as financial period (allows future)
        is_valid, error_msg = DateValidator.validate_date_context(
            start_date, DateContext.FINANCIAL_PERIOD, input_format=input_format
        )
        if not is_valid:
            return False, f"Start date: {error_msg}"
    
        is_valid, error_msg = DateValidator.validate_date_context(
            end_date, DateContext.FINANCIAL_PERIOD, input_format=input_format
        )
        if not is_valid:
            return False, f"End date: {error_msg}"
        
        # Validate date range
        return DateValidator.validate_date_range(start_date, end_date, input_format)
    
    @staticmethod
    def validate_system_event_date(date_string: str,
                                   reference_date: Optional[date] = None,
                                   input_format: Literal["display", "storage"] = "display") -> Tuple[bool, Optional[str]]:
        """
        Validate a system event date (submission, approval, report generation).
        
        Args:
            date_string: Date string to validate
            reference_date: Optional reference date for relative validation
            input_format: "display" for YY/MM/DD, "storage" for YYYY-MM-DD
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        return DateValidator.validate_date_context(
            date_string, DateContext.SYSTEM_EVENT, reference_date, input_format
        )


# Convenience functions for common use cases
def validate_date_input(date_string: str, context: DateContext = DateContext.GENERAL,
                       input_format: Literal["display", "storage"] = "display") -> Tuple[bool, Optional[str]]:
    """
    Convenience function for validating a single date input.
    
    Args:
        date_string: Date string to validate
        context: DateContext for validation rules
        input_format: "display" for YY/MM/DD, "storage" for YYYY-MM-DD
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    return DateValidator.validate_date_context(date_string, context, input_format=input_format)


def validate_date_pair(start_date: str, end_date: str,
                      context: DateContext = DateContext.GENERAL,
                      input_format: Literal["display", "storage"] = "display") -> Tuple[bool, Optional[str]]:
    """
    Convenience function for validating a date pair (start/end).
    
    Args:
        start_date: Start date string
        end_date: End date string
        context: DateContext for validation rules
        input_format: "display" for YY/MM/DD, "storage" for YYYY-MM-DD
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    # Validate individual dates
    is_valid, error_msg = validate_date_input(start_date, context, input_format)
    if not is_valid:
        return False, f"Start date: {error_msg}"
    
    is_valid, error_msg = validate_date_input(end_date, context, input_format)
    if not is_valid:
        return False, f"End date: {error_msg}"
    
    # Validate range
    return DateValidator.validate_date_range(start_date, end_date, input_format)