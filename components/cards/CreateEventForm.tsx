"use client"


import { zodResolver } from "@hookform/resolvers/zod"
import { defineStepper } from "@stepperize/react"
import { Plus } from "lucide-react"
import { FormProvider, useForm } from "react-hook-form"
import * as z from "zod"

import AddHoursFormComponent from "@/components/cards/EventForm/AddHoursFormComponent"
import GeneralFormComponent from "@/components/cards/EventForm/GeneralFormComponent"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { selectEvents } from "@/lib/features/eventListSlice";
import { selectPools } from "@/lib/features/poolListSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { deserializeToEvent } from "@/lib/models/LeaveEvent";
import { deserializeToPool } from "@/lib/models/LeavePool"
import { AddHoursSchema, GeneralSchema, UseHoursSchema } from "@/lib/validators/leave-event.validator"

export function CreateEventForm() {
  const dispatch = useAppDispatch()

  // Need pools for validation reasons
  const pools = useAppSelector(selectPools).map(deserializeToPool);
  const pool_names = pools.map(p => p.name)
  // Need events for validation reasons
  const events = useAppSelector(selectEvents).map(deserializeToEvent);

  const Stepper = defineStepper(
    { id: "general", label: "General Information", schema: GeneralSchema },
    { id: "adding", label: "Adding Hours to Pool", schema: AddHoursSchema(pool_names) },
    { id: "using", label: "Using Hours in Pool", schema: UseHoursSchema(pool_names) },
  )

  const stepper = Stepper.useStepper();

  const form = useForm({
    mode: "onTouched",
    resolver: zodResolver(stepper.current.schema),
  })


  const onSubmit = (values: z.infer<typeof stepper.current.schema>) => {
    console.log(`Form values for step ${stepper.current.id}:`, values);
    if (stepper.isLast) {
      // Create the event
      return
    }

    if (stepper.current.id == "general") {
      stepper.goTo(form.getValues("leave_action")!)
    }
  };

  const currentIndex = Stepper.utils.getIndex(stepper.current.id);
  return (

    <FormProvider {...form}>
      <Stepper.Scoped>
        <Dialog>
          <form id="form-create-event" onSubmit={form.handleSubmit(onSubmit)}>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" onClick={() => {
                console.debug("Clicked create event...")
              }}>
                <Plus />
              </Button>
            </DialogTrigger>
            <DialogContent className="">
              <DialogHeader>
                <DialogTitle>Create New Event</DialogTitle>
                <DialogDescription>
                  Make changes to the event here. Click save when you&apos;re done.
                </DialogDescription>
              </DialogHeader>
              <main>
                <div className="space-y-4">
                  {stepper.switch({
                    general: () => <GeneralFormComponent />,
                    adding: () => <AddHoursFormComponent />,
                    // using: () => <UseHoursFormComponent />,
                  })}
                  {!stepper.isLast ? (
                    <div className="flex justify-end gap-4">
                    </div>
                  ) : (
                    <Button onClick={stepper.reset}>Reset</Button>
                  )}
                </div>
              </main>
              <DialogFooter>
                <Button type="reset" variant="outline" form="form-create-event" onClick={() => form.reset()}>Clear</Button>
                <Button
                  variant="secondary"
                  onClick={stepper.prev}
                  disabled={stepper.isFirst}
                >
                  Back
                </Button>
                <Button type="submit" form="form-create-event">
                  {stepper.isLast ? 'Finish' : 'Next'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </form >
        </Dialog >

      </Stepper.Scoped>
    </FormProvider>
  )
}
