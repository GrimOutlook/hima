import { CalendarIcon } from "lucide-react"
import { useState } from "react"
import { Controller, useFormContext } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const AddHoursFormComponent: React.FC = () => {
  const [calendarOpen, setCalendarOpen] = useState(false)
  const context = useFormContext();

  return (
    <FieldSet>
      <FieldGroup>
        <Controller
          name="add_date"
          control={context.control}
          render={({ field, fieldState }) => (
            <Field orientation="horizontal" data-invalid={fieldState.invalid}>
              <FieldContent>
                <FieldLabel htmlFor={field.name}>Date Added</FieldLabel>
                <FieldDescription>The date the added hours take effect</FieldDescription>
              </FieldContent>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen} modal={true}>
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
                      context.setValue(field.name, date || null)
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
    </FieldSet>
  )
}

export default AddHoursFormComponent
