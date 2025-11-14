import { z } from 'zod'

export const GeneralSchema = z.object({
  name: z
    .string("Name is required").min(1, "Name is required"),
  description: z.string().optional(),
  leave_action: z.enum(["using", "adding"], "Leave Action is required").nullable(),
})

export const AddHoursSchema = (pool_names: string[]) => z.object({
  amount: z.string().min(1, "Amount is required").regex(/\d+/, "Amount must be a number"),
  add_date: z.date().nullable(),
  pool: z.enum(pool_names).nullable()
})
  .refine(data => data.pool == null, "Pool is required")
  .refine(data => data.add_date == null, "Date Added is required")

export const UseHoursSchema = (pool_names: string[]) => z.object({
  use_dates: z.array(z.object({
    dates: z.object({
      from: z.date().nullable(),
      to: z.date().nullable()
    }),
    pool: z.enum(pool_names).nullable()
  }).refine(val => val.dates.from && !val.pool, "Pool not set for dates")),
})
  .refine(data => data.use_dates.find((item) => item.pool && item.dates.from), "At least 1 use date is required")
