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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

type EventListingProps = {
  schema: z.ZodObject;
};


const GeneralFormComponent: React.FC<EventListingProps> = ({ schema }) => {

  const context = useFormContext<z.infer<typeof schema>>();

  return (
    <>
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
      </FieldSet></>)
}
