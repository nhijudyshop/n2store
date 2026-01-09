// unified-customer-hub/src/modules/customer/customer.errors.ts

export class CustomerError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'CustomerError';
  }

  static notFound(identifier: string) {
    return new CustomerError('CUSTOMER_NOT_FOUND', `Customer with identifier ${identifier} not found`);
  }

  static invalidData(details?: string) {
    return new CustomerError('INVALID_CUSTOMER_DATA', `Invalid customer data provided: ${details || 'Unknown reason'}`);
  }

  // Add more specific error types as needed
}
