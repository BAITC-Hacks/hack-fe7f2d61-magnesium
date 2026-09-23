export class ApiError extends Error {
  constructor(public statusCode: number, public code: string, message: string) { super(message); }
}

export const notFound = () => new ApiError(404, 'NOT_FOUND', 'Объект не найден.');
export const conflict = (message: string) => new ApiError(409, 'CONFLICT', message);
