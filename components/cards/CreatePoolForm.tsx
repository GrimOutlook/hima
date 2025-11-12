"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import dayjs from "dayjs"
import { Plus } from "lucide-react"
import { CalendarIcon } from "lucide-react"
import React from "react"
import { useForm } from "react-hook-form"
import { Controller } from "react-hook-form"
import * as z from "zod"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { addPool, selectPools } from "@/lib/features/poolListSlice";
import { formatDate, isValidDate } from "@/lib/helpers"
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { LeavePoolFormDto } from "@/lib/models/LeavePool"
import { periods } from "@/lib/models/Period";

const dateFormat = 'MMMM DD, YYYY'

export function CreatePoolForm() {
  const dispatch = useAppDispatch()
  // Get the name of all Leave pools for validation
  const pool_names = useAppSelector(selectPools).map(p => p.name) || [];

  type FormSchema = z.infer<typeof formSchema>;

  const formSchema = z.object({
    name: z
      .string().min(1, "Name is required")
      .refine(val => !pool_names.includes(val), "Name already used"),
    description: z.string().optional(),
    period: z.enum(periods, "Period is required"),
    amount: z.string().min(1, "Amount is required").regex(/\d+/, "Amount must be a number"),
    startDate: z.string()
      .min(1, "Starting date is required")
      .refine(
        val => dayjs(val, dateFormat, true).isValid(),
        "Date format is invalid"
      ),
    startAmount: z
      .string()
      .min(1, "Starting amount is required")
      .regex(/\d+/, "Starting amount must be a number"),
  })

  const form = useForm<FormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      period: "",
      amount: "",
      startDate: "",
      startAmount: "",
    }
  })

  // Date State
  const [open, setOpen] = React.useState(false)
  const [month, setMonth] = React.useState<Date | undefined>()
  const [value, setValue] = React.useState(formatDate(undefined))

  function onSubmit(data: FormSchema) {
    console.debug("Submitted new pool data: " + data)

    // Create a new leave pool with the given information
    const new_pool: LeavePoolFormDto = {
      ...data,
      amount: Number(data.amount),
      startAmount: Number(data.startAmount),
    }
    dispatch(addPool(new_pool))

  }


  return (
    <Dialog>
      <form id="form-create-pool" onSubmit={form.handleSubmit(onSubmit)}>
        <DialogTrigger asChild>
          <Button variant="outline" size="icon" onClick={() => {
            console.debug("Clicked create pool...")
          }}>
            <Plus />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New Pool</DialogTitle>
            <DialogDescription>
              Make changes to the pool here. Click save when you&apos;re
              done.
            </DialogDescription>
          </DialogHeader>
          <main>
            <FieldGroup>
              <FieldSeparator />
              <FieldSet>
                <FieldGroup>
                  <Controller
                    name="name"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                        <Input {...field} id={field.name} placeholder="Sick Leave, etc..." required aria-invalid={fieldState.invalid} />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )} />
                  <Controller
                    name="description"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={field.name}>Description</FieldLabel>
                        <Textarea {...field} placeholder="Describe what the pool represents" />
                      </Field>
                    )} />
                </FieldGroup>
              </FieldSet>
              <FieldSeparator />
              <FieldSet>
                <Controller
                  name="period"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field orientation="horizontal" data-invalid={fieldState.invalid}>
                      <FieldContent>
                        <FieldLabel htmlFor={field.name}>Period</FieldLabel>
                        <FieldDescription>How long between hours being added to the pool. This is usually the amount of time between paychecks</FieldDescription>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </FieldContent>
                      <Select name={field.name} value={field.value} onValueChange={field.onChange} defaultValue="">
                        <SelectTrigger aria-invalid={fieldState.invalid}>
                          <SelectValue placeholder="Period" />
                        </SelectTrigger>
                        <SelectContent position="item-aligned">
                          {
                            periods.map((period, idx) =>
                              <SelectItem key={idx} value={period}>{period}</SelectItem>
                            )
                          }
                        </SelectContent>
                      </Select>
                    </Field>
                  )} />
                <Controller
                  name="amount"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field orientation="horizontal" data-invalid={fieldState.invalid}>
                      <FieldContent>
                        <FieldLabel htmlFor={field.name}>Hours</FieldLabel>
                        <FieldDescription>How many hours get added every period</FieldDescription>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </FieldContent>
                      <Input {...field} id={field.name} className="min-w-3 max-w-14" type="number" placeholder="10" required aria-invalid={fieldState.invalid} />
                    </Field>
                  )} />
              </FieldSet>
              <FieldSeparator />
              <FieldSet>
                <Controller
                  name="startDate"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field orientation="horizontal" data-invalid={fieldState.invalid}>
                      <FieldContent>
                        <FieldLabel htmlFor={field.name}>Start Date</FieldLabel>
                        <FieldDescription>When the first period should start</FieldDescription>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </FieldContent>
                      <div className="relative flex gap-2">
                        <Input
                          {...field} id={field.name}
                          value={value}
                          placeholder={formatDate(dayjs().toDate())}
                          className="bg-background pr-10"
                          aria-invalid={fieldState.invalid}
                          onChange={(e) => {
                            const date = new Date(e.target.value)

                            setValue(e.target.value)
                            if (isValidDate(date)) {
                              setMonth(date)
                              form.setValue(field.name, e.target.value)
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowDown") {
                              e.preventDefault()
                              setOpen(true)
                            }
                          }}
                        />
                        <Popover open={open} onOpenChange={setOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              id="date-picker"
                              variant="ghost"
                              className="absolute top-1/2 right-2 size-6 -translate-y-1/2"
                            >
                              <CalendarIcon className="size-3.5" />
                              <span className="sr-only">Select date</span>
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-auto overflow-hidden p-0"
                            align="end"
                            alignOffset={-8}
                            sideOffset={10}
                          >
                            <Calendar
                              mode="single"
                              selected={dayjs(field.value, dateFormat).toDate()}
                              captionLayout="dropdown"
                              month={month}
                              onMonthChange={setMonth}
                              onSelect={(date) => {
                                setValue(formatDate(date))
                                if (date != undefined) {
                                  form.setValue(field.name, formatDate(date))
                                  form.clearErrors(field.name)
                                  setOpen(false)
                                }
                              }}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </Field>
                  )} />
                <Controller
                  name="startAmount"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid} orientation="horizontal">
                      <FieldContent>
                        <FieldLabel htmlFor={field.name}>Starting Amount</FieldLabel>
                        <FieldDescription>How many hours were in the pool on the start date</FieldDescription>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </FieldContent>
                      <Input {...field} id={field.name} className="min-w-3 max-w-14" type="number" placeholder="40" required aria-invalid={fieldState.invalid} />
                    </Field>
                  )} />
              </FieldSet>
            </FieldGroup>
          </main>
          <DialogFooter>
            <Button type="reset" variant="secondary" form="form-create-pool" onClick={() => { setValue(""); form.reset() }}>Clear</Button>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" form="form-create-pool">Save</Button>
          </DialogFooter>
        </DialogContent>
      </form>
    </Dialog>
  )
}
