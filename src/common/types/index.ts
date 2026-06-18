enum HttpStatus {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  NOT_MODIFIED = 304,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  GONE = 410,
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503,
}

const HttpStatusLabel: Record<HttpStatus, string> = {
  [HttpStatus.OK]: 'Ok',
  [HttpStatus.CREATED]: 'Created',
  [HttpStatus.NO_CONTENT]: 'No Content',
  [HttpStatus.NOT_MODIFIED]: 'Not Modified',
  [HttpStatus.BAD_REQUEST]: 'Bad Request',
  [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.NOT_FOUND]: 'Not Found',
  [HttpStatus.GONE]: 'Gone',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'Service Unavailable',
} as const;

type StatusCodeLabel = (typeof HttpStatusLabel)[HttpStatus];

interface IResponse<T> {
  statusCode: HttpStatus;
  message: string[];
  data: T;
  error: StatusCodeLabel | null;
}

export { type IResponse, HttpStatus, HttpStatusLabel };
