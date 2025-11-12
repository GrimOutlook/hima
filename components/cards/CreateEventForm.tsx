"use client"


import { zodResolver } from "@hookform/resolvers/zod"
import dayjs from "dayjs"
import { CalendarIcon, Plus, Trash2 } from "lucide-react"
import React from "react"
import { type DateRange } from "react-day-picker"
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
import { Textarea } from "@/components/ui/textarea"
import { selectEvents } from "@/lib/features/eventListSlice";
import { selectPools } from "@/lib/features/poolListSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { deserializeToEvent } from "@/lib/models/LeaveEvent";
import { deserializeToPool } from "@/lib/models/LeavePool"


const dateFormat = 'MMMM DD, YYYY'

export function CreateEventForm() {
  const dispatch = useAppDispatch()

  // Need pools for validation reasons
  const pools = useAppSelector(selectPools).map(deserializeToPool);
  // Need events for validation reasons
  const events = useAppSelector(selectEvents).map(deserializeToEvent);

  type FormSchema = z.infer<typeof formSchema>;

  const formSchema = z.object({
    name: z
      .string().min(1, "Name is required"),
    description: z.string().optional(),
    leave_action: z.enum(["using", "adding"]).nullable(),
    amount: z.string().min(1, "Amount is required").regex(/\d+/, "Amount must be a number"),
    useDates: z.array(z.object({ from: z.date().nullable(), to: z.date().nullable() })).refine(val =>
      val.find((item) => item.to != null && item.from != null) != undefined
      , "At least 1 use date is required"),
    addDate: z.date().nullable()
  })
    .refine(data => data.leave_action == "using" && data.useDates == null, "Using Dates is required")
    .refine(data => data.leave_action == "adding" && data.useDates == null, "Date Added is required")

  const form = useForm<FormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      leave_action: null,
      amount: "",
      useDates: [{ from: null, to: null }],
      addDate: null,
    }
  })

  const useDatesFieldArray = useFieldArray({
    control: form.control,
    name: "useDates",
  })

  // Date State
  const [open, setOpen] = React.useState(false)

  // TODO: I couldn't find a way to use the `form` updates to conditionally
  // render fields which meant that this is required. There is almost certainly
  // a way to do it so if it is found, replace this.
  const [leaveAction, setLeaveAction] = React.useState<string | null>(null)

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
                      name="addDate"
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field orientation="horizontal" data-invalid={fieldState.invalid}>
                          <FieldContent>
                            <FieldLabel htmlFor={field.name}>Date Added</FieldLabel>
                            <FieldDescription>The date the added hours take effect</FieldDescription>
                          </FieldContent>
                          <Popover open={open} onOpenChange={setOpen}>
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
                      let button_string = "Select Dates"
                      if (!!field.from) {
                        button_string = field.from.toLocaleDateString()
                      }
                      if (!!field.to && field.to.toDateString() != field.from?.toDateString()) {
                        button_string += " → " + field.to.toLocaleDateString()
                      }

                      return (
                        <div key={field.id} className="flex flex-row gap-2">
                          <Controller
                            name={`useDates.${index}`}
                            control={form.control}
                            render={(control) => (
                              <Field data-invalid={control.fieldState.invalid}>
                                <Popover open={open} onOpenChange={setOpen} >
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      id={control.field.name}
                                      className="w-48 justify-between font-normal"
                                    >
                                      {button_string}
                                      <CalendarIcon />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                                    <Calendar
                                      mode="range"
                                      selected={{ to: field.to || undefined, from: field.from || undefined }}
                                      captionLayout="dropdown"
                                      onDayClick={(date) => {
                                        // If the user didn't select a date, and
                                        // no date has been selected yet, or if
                                        // the user selected the same day that
                                        // is already selected, remove the date
                                        // input if it is not the first input.
                                        // First input needs to stay so users
                                        // can input dates still
                                        if ((date == undefined && field == undefined || date == field.to) && index != 0) {
                                          useDatesFieldArray.remove(index)
                                          return
                                        }

                                        let from, to;
                                        if (
                                          // If `to` is set, then reset the `to`
                                          // and `from` values, setting the `to`
                                          // to the newly selected value.
                                          field.to != undefined
                                          // // If the user selected a date
                                          // // before the `to` date reset the
                                          // // just set the `to` date to the newly
                                          // // selected date
                                          // || (field.from && field.from.getTime() < date.getTime())
                                        ) {
                                          from = date
                                          to = undefined
                                        } else {
                                          from = field.from
                                          to = date
                                        }
                                        useDatesFieldArray.replace({ from: from, to: to || null })
                                      }}
                                    />
                                  </PopoverContent>
                                </Popover>
                              </Field>
                            )} />
                          {index != useDatesFieldArray.fields.length - 1 &&
                            < Button variant="outline" size="icon-sm" >
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
