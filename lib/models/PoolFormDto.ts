import { PoolDto } from "./Pool";

export type PoolFormDataDto = PoolDto;

export const initialPoolFormDataDto: PoolFormDataDto = {
  amount: 0,
  description: "",
  id: 0,
  name: "",
  period: "",
  startAmount: 0,
  startDate: "",
};
