import { LeavePoolDto } from "./LeavePool";

type UndefinedOk<T> = {
  [P in keyof T]?: T[P];
};


export type PoolFormDataDto = UndefinedOk<Omit<LeavePoolDto, 'id'>>;

export const initialPoolFormDataDto: PoolFormDataDto = {};
