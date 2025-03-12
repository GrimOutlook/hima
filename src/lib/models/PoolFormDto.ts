import { PPLPoolDto } from "./PPLPoolDto";

export type PoolFormDataDto = PPLPoolDto;

export const initialPoolFormDataDto: PoolFormDataDto = {
  amount: 0,
  description: "",
  id: 0,
  name: "",
  period: "",
  startAmount: 0,
  startDate: "",
};