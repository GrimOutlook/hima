"use client"


import { zodResolver } from "@hookform/resolvers/zod"
import { defineStepper } from "@stepperize/react"
import { Plus } from "lucide-react"
import React from "react"
import { useFieldArray, useForm, useFormContext } from "react-hook-form"
import * as z from "zod"

import { Button } from "@/components/ui/button"
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
import { Separator } from "@/components/ui/separator"
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

  const generalSchema = z.object({
    name: z
      .string().min(1, "Name is required"),
    description: z.string().optional(),
    leave_action: z.enum(["using", "adding"]).nullable(),
  })
  const addHoursSchema = z.object({
    amount: z.string().min(1, "Amount is required").regex(/\d+/, "Amount must be a number"),
    add_date: z.date().nullable(),
    pool: z.enum(pool_names).nullable()
  })
    .refine(data => data.pool == null, "Pool is required")
    .refine(data => data.add_date == null, "Date Added is required")
  const useHoursSchema = z.object({
    use_dates: z.array(z.object({
      dates: z.object({
        from: z.date().nullable(),
        to: z.date().nullable()
      }),
      pool: z.enum(pool_names).nullable()
    }).refine(val => val.dates.from && !val.pool, "Pool not set for dates")),
  })
    .refine(data => data.use_dates.find((item) => item.pool && item.dates.from), "At least 1 use date is required")

  const { useStepper, steps, utils } = defineStepper(
    { id: "general", label: "General", schema: generalSchema },
    { id: "adding", label: "Adding Hours to Pool", schema: addHoursSchema },
    { id: "using", label: "Using Hours in Pool", schema: useHoursSchema },
  )

  const stepper = useStepper();

  const form = useForm({
    mode: "onTouched",
    resolver: zodResolver(stepper.current.schema),
  })


  const onSubmit = (values: z.infer<typeof stepper.current.schema>) => {
    // biome-ignore lint/suspicious/noConsoleLog: <We want to log the form values>
    console.log(`Form values for step ${stepper.current.id}:`, values);
    if (stepper.isLast) {
      stepper.reset();
    } else {
      stepper.next();
    }
  };

  const currentIndex = utils.getIndex(stepper.current.id);
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
            <div className="flex justify-between">
              <h2 className="text-lg font-medium">Checkout</h2>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Step {currentIndex + 1} of {steps.length}
                </span>
              </div>
            </div>
            <nav aria-label="Checkout Steps" className="group my-4">
              <ol
                className="flex items-center justify-between gap-2"
                aria-orientation="horizontal"
              >
                {stepper.all.map((step, index, array) => (
                  <React.Fragment key={step.id}>
                    <li className="flex items-center gap-4 flex-shrink-0">
                      <Button
                        type="button"
                        role="tab"
                        variant={index <= currentIndex ? 'default' : 'secondary'}
                        aria-current={
                          stepper.current.id === step.id ? 'step' : undefined
                        }
                        aria-posinset={index + 1}
                        aria-setsize={steps.length}
                        aria-selected={stepper.current.id === step.id}
                        className="flex size-10 items-center justify-center rounded-full"
                        onClick={async () => {
                          const valid = await form.trigger();
                          //must be validated
                          if (!valid) return;
                          //can't skip steps forwards but can go back anywhere if validated
                          if (index - currentIndex > 1) return;
                          stepper.goTo(step.id);
                        }}
                      >
                        {index + 1}
                      </Button>
                      <span className="text-sm font-medium">{step.label}</span>
                    </li>
                    {index < array.length - 1 && (
                      <Separator
                        className={`flex-1 ${index < currentIndex ? 'bg-primary' : 'bg-muted'
                          }`}
                      />
                    )}
                  </React.Fragment>
                ))}
              </ol>
            </nav>
            <div className="space-y-4">
              {stepper.switch({
                general: () => <GeneralFormComponent schema={generalSchema} />,
                // adding: () => <AddHoursFormComponent />,
                // using: () => <UseHoursFormComponent />,
              })}
              {!stepper.isLast ? (
                <div className="flex justify-end gap-4">
                  <Button
                    variant="secondary"
                    onClick={stepper.prev}
                    disabled={stepper.isFirst}
                  >
                    Back
                  </Button>
                  <Button type="submit">
                    {stepper.isLast ? 'Complete' : 'Next'}
                  </Button>
                </div>
              ) : (
                <Button onClick={stepper.reset}>Reset</Button>
              )}
            </div>
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
