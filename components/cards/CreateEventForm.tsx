"use client"


import { zodResolver } from "@hookform/resolvers/zod"
import { CalendarIcon, Plus, Trash2 } from "lucide-react"
import React from "react"
import { Controller, useFieldArray, useForm } from "react-hook-form"
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
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { selectEvents } from "@/lib/features/eventListSlice";
import { selectPools } from "@/lib/features/poolListSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { deserializeToEvent } from "@/lib/models/LeaveEvent";
import { deserializeToPool } from "@/lib/models/LeavePool"

export function CreateEventForm() {
  const dispatch = useAppDispatch()

  // Need pools for validation reasons
  const pools = useAppSelector(selectPools).map(deserializeToPool);
  const pool_names = pools.map(p => p.name)
  // Need events for validation reasons
  const events = useAppSelector(selectEvents).map(deserializeToEvent);

  const empty_date_field = { dates: { from: null, to: null }, pool: null }

  const formSchema = z.object({
    name: z
      .string().min(1, "Name is required"),
    description: z.string().optional(),
    leave_action: z.enum(["using", "adding"]).nullable(),
    amount: z.string().min(1, "Amount is required").regex(/\d+/, "Amount must be a number"),
    use_dates: z.array(z.object({
      dates: z.object({
        from: z.date().nullable(),
        to: z.date().nullable()
      }),
      pool: z.enum(pool_names).nullable()
    }).refine(val => val.dates.from && !val.pool, "Pool not set for dates")),
    add_date: z.date().nullable(),
    pool: z.enum(pool_names).nullable()
  })
    .refine(data => data.leave_action == "using" && data.use_dates.find((item) => item.pool && item.dates.from), "At least 1 use date is required")
    .refine(data => data.leave_action == "adding" && data.add_date == null, "Date Added is required")
    .refine(data => data.leave_action == "adding" && data.pool == null, "Pool is required")

  type FormSchema = z.infer<typeof formSchema>;
  const form = useForm<FormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      leave_action: null,
      amount: "",
      use_dates: [empty_date_field],
      add_date: null,
      pool: null,
    }
  })

  const useDatesFieldArray = useFieldArray({
    control: form.control,
    name: "use_dates",
  })

  // Date State
  const [addedOpen, setAddedOpen] = React.useState(false)
  const [usingOpen, setUsingOpen] = React.useState([false])

  const nextInputRef = React.useRef<HTMLInputElement>(null);

  // TODO: I couldn't find a way to use the `form` updates to conditionally
  // render fields which meant that this is required. There is almost certainly
  // a way to do it so if it is found, replace this.
  const [leaveAction, setLeaveAction] = React.useState<string | null>(null)

  // The pool that was selected last from a `pools` dropdown. This is useful
  // when trying to determine what we should auto-fill the next date range pool
  // selection with.
  type PoolName = typeof pool_names[number];
  const [lastSelectedPool, setLastSelectedPool] = React.useState<PoolName | null>(null)

  function onSubmit(data: FormSchema) {
    console.debug("Submitted new event data: " + data)

    // // Create a new leave pool with the given information
    // const new_pool: LeavePoolFormDto = {
    //   ...data,
    //   amount: Number(data.amount),
    //   startAmount: Number(data.startAmount),
    // }
    // dispatch(addPool(new_pool))

  }


  return (
    <Dialog>
      <form id="form-create-event" onSubmit={form.handleSubmit(onSubmit)}>
        <DialogTrigger asChild>
          <Button variant="outline" size="icon" onClick={() => {
            console.debug("Clicked create event...")
          }}>
            <Plus />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New Event</DialogTitle>
            <DialogDescription>
              Make changes to the event here. Click save when you&apos;re done.
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
                        <Input {...field} id={field.name} placeholder="Dentist Appointment, etc..." required aria-invalid={fieldState.invalid} />
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
                        <Textarea {...field} placeholder="Additional information for event..." />
                      </Field>
                    )} />
                </FieldGroup>
              </FieldSet>
              <FieldSeparator />
              <FieldSet>
                <FieldGroup>
                  <Controller
                    name="leave_action"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <FieldSet data-invalid={fieldState.invalid}>
                        <RadioGroup
                          name={field.name}
                          value={field.value}
                          onValueChange={(e) => { field.onChange(e); setLeaveAction(e) }}
                          aria-invalid={fieldState.invalid}
                        >
                          <FieldLabel htmlFor="form-leave_action-using_hours">
                            <Field orientation="horizontal">
                              <FieldContent>
                                <FieldTitle>Using Hours</FieldTitle>
                                <FieldDescription>
                                  Using hours in a pool to get paid leave off of work.
                                </FieldDescription>
                              </FieldContent>
                              <RadioGroupItem
                                value="using"
                                id="form-leave_action-using_hours"
                              />
                            </Field>
                          </FieldLabel>
                          <FieldLabel htmlFor="form-leave_action-adding_hours">
                            <Field orientation="horizontal">
                              <FieldContent>
                                <FieldTitle>Adding Hours</FieldTitle>
                                <FieldDescription>
                                  Adding hours to a pool for later paid time off of work.
                                </FieldDescription>
                              </FieldContent>
                              <RadioGroupItem
                                value="adding"
                                id="form-leave_action-adding_hours"
                              />
                            </Field>
                          </FieldLabel>
                        </RadioGroup>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </FieldSet>
                    )} />
                </FieldGroup>
                {leaveAction == "adding" &&
                  <FieldGroup>
                    <Controller
                      name="add_date"
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field orientation="horizontal" data-invalid={fieldState.invalid}>
                          <FieldContent>
                            <FieldLabel htmlFor={field.name}>Date Added</FieldLabel>
                            <FieldDescription>The date the added hours take effect</FieldDescription>
                          </FieldContent>
                          <Popover open={addedOpen} onOpenChange={setAddedOpen} modal={true}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                id="date"
                                className="w-48 justify-between font-normal"
                              >
                                {field.value ? field.value.toLocaleDateString() : "Select date"}
                                <CalendarIcon />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value || undefined}
                                captionLayout="dropdown"
                                onSelect={(date) => {
                                  form.setValue(field.name, date || null)
                                }}
                              />
                            </PopoverContent>
                          </Popover>
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )} />
                  </FieldGroup>
                }
                {leaveAction == "using" &&
                  <FieldGroup className="gap-4">
                    <FieldLegend>Using Dates</FieldLegend>
                    <FieldDescription>Dates that you want to use paid leave</FieldDescription>

                    {useDatesFieldArray.fields.map((field, index) => {
                      const last_using_date_index = useDatesFieldArray.fields.length - 1;
                      const last_using_date = useDatesFieldArray.fields[last_using_date_index];
                      const pool = field.pool
                      const dates = field.dates

                      let button_string = "Select Dates"
                      if (dates.from) {
                        button_string = dates.from.toLocaleDateString()
                        if (dates.to && dates.to.toDateString() != dates.from?.toDateString()) {
                          button_string += " → " + dates.to.toLocaleDateString()
                        }
                      }

                      return (
                        <div key={field.id} className="flex flex-row gap-2">
                          <Controller
                            name={`use_dates.${index}.dates`}
                            control={form.control}
                            render={(control) => (
                              <Field data-invalid={control.fieldState.invalid}>
                                <Popover open={usingOpen[index]} onOpenChange={(e) => {
                                  console.debug(`Setting use_dates.${index}.dates is open: ${e}`)
                                  setUsingOpen(usingOpen.map((def, openIndex) => openIndex == index ? e : def))
                                }} >
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      id={`use_dates.${index}.dates-button`}
                                      className="w-full justify-between font-normal basis-2/3"
                                    >
                                      {button_string}
                                      <CalendarIcon />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto overflow-hidden p-0" align="start" ref={usingOpen[index] ? nextInputRef : undefined}>
                                    <Calendar
                                      mode="range"
                                      selected={{ to: field.dates.to || undefined, from: field.dates.from || undefined }}
                                      captionLayout="dropdown"
                                      onDayClick={(date) => {
                                        if (!date && !field.dates.from && !field.pool && index != 0) {
                                          console.debug("Removing empty use_date index: " + index)
                                          useDatesFieldArray.remove(index)
                                          return
                                        }

                                        let from, to;
                                        if (
                                          !field.dates.from
                                          // If `to` is set, then reset the `to`
                                          // and `from` values, setting the `to`
                                          // to the newly selected value.
                                          || field.dates.to
                                          // // If the user selected a date
                                          // // before the `to` date reset the
                                          // // just set the `to` date to the newly
                                          // // selected date
                                          // || (field.dates.from && field.dates.from.getTime() < date.getTime())
                                        ) {
                                          from = date
                                          to = null
                                        } else {
                                          from = field.dates.from
                                          to = date
                                        }

                                        // Make sure the dates always go from
                                        // earliest to latest
                                        if (from && to && from.getTime() > to.getTime()) {
                                          const temp = from
                                          from = to
                                          to = temp
                                        }
                                        console.debug("Updating use_dates index " + index)
                                        useDatesFieldArray.update(index, { ...field, dates: { from: from, to: to || null } })

                                        if (field.pool && from && index == last_using_date_index) {
                                          console.debug("Creating use_dates index " + (index + 1))
                                          useDatesFieldArray.append(empty_date_field)
                                          // Open the calendar back up. It
                                          // closes when making a new field.
                                          setUsingOpen(usingOpen.map((def, openIndex) => openIndex == index ? true : def))
                                        }
                                      }}
                                    />
                                  </PopoverContent>
                                </Popover>
                              </Field>
                            )
                            } />

                          < Controller
                            name={`use_dates.${index}.pool`}
                            control={form.control}
                            render={(control) => (
                              <Field data-invalid={control.fieldState.invalid}>
                                <Select name={`use_dates.${index}.pool-select`} value={pool || undefined} onValueChange={(pool) => {
                                  console.debug("Updating use_dates index " + index)
                                  useDatesFieldArray.update(index, { ...field, pool: pool || null })

                                  if (pool && field.dates.from && index == last_using_date_index) {
                                    console.debug("Creating use_dates index " + (index + 1))
                                    useDatesFieldArray.append(empty_date_field)
                                  }
                                }} defaultValue="">
                                  <SelectTrigger aria-invalid={control.fieldState.invalid} className="w-full basis-1/3">
                                    <SelectValue placeholder="Pool" />
                                  </SelectTrigger>
                                  <SelectContent position="item-aligned">
                                    {
                                      pool_names.map((pool, idx) =>
                                        <SelectItem key={idx} value={pool}>{pool}</SelectItem>
                                      )
                                    }
                                  </SelectContent>
                                </Select>
                              </Field>
                            )} />
                          {index != useDatesFieldArray.fields.length - 1 &&
                            <Button variant="outline" size="icon-sm" onClick={() => useDatesFieldArray.remove(index)}>
                              <Trash2 />
                            </Button>
                          }
                        </div>
                      )
                    })}
                  </FieldGroup>
                }
              </FieldSet>
            </FieldGroup>
          </main>
          <DialogFooter>
            <Button type="reset" variant="secondary" form="form-create-event" onClick={() => form.reset()}>Clear</Button>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" form="form-create-event">Save</Button>
          </DialogFooter>
        </DialogContent>
      </form >
    </Dialog >
  )
}
