export type ApiSuccess<T> = {
  data: T;
  error: null;
};

export type ApiFailure = {
  data: null;
  error: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function isApiSuccess<T>(response: ApiResponse<T>): response is ApiSuccess<T> {
  return response.error === null;
}
