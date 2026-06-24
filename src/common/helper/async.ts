import { HttpStatusLabel, HttpStatus } from '../types';
import type { IResponse } from '../types';

interface IOptions {
  /**
   * good for doing some background jobs
   */
  onSuccess: () => void | Promise<void>;
}

interface ICallBackReturn<T> {
  /**
   *  the data that is returned in the body of the response
   */
  data: T;
  /**
   *  the statusCode of response
   */
  statusCode: HttpStatus;
  /**
   *  the successMessage you wanna sent to clients
   */
  messages: string | string[];
}

/**
 * A helper refactored function for logging errors and better DX
 */
async function asyncFn<T>(
  callback: () => Promise<ICallBackReturn<T>> | ICallBackReturn<T>,
  options?: IOptions,
): Promise<IResponse<T | null>> {
  try {
    const { data, messages: resMessage, statusCode } = await callback();
    const messages = resMessage
      ? typeof resMessage === 'string'
        ? [resMessage]
        : resMessage
      : [];
    const error = [HttpStatus.OK, HttpStatus.CREATED].includes(statusCode)
      ? null
      : HttpStatusLabel[statusCode];

    if (options?.onSuccess) {
      await options.onSuccess();
    }

    return {
      statusCode,
      messages,
      data,
      error,
    };
  } catch (error) {
    console.error('Internal Server Error:', error); // Use console.error for errors
    return {
      statusCode: 500,
      messages: ['مشکلی پیش آمده بعداً تلاش کنید.'],
      data: null,
      error: HttpStatusLabel[500],
    };
  }
}

export default asyncFn;
