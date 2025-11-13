import { Stepper } from "@stepperize/react"
import { Controller, useFormContext } from "react-hook-form"
import * as z from "zod"

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"

const GeneralFormComponent: React.FC = () => {
  const context = useFormContext();

  return (
    <>
      <FieldSeparator />
      <FieldSet>
        <FieldGroup>
          <Controller
            name="name"
            control={context.control}
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
            control={context.control}
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
            control={context.control}
            render={({ field, fieldState }) => (
              <FieldSet data-invalid={fieldState.invalid}>
                <RadioGroup
                  name={field.name}
                  value={field.value}
                  onValueChange={field.onChange}
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
      </FieldSet>
    </>
  )
}

export default GeneralFormComponent
