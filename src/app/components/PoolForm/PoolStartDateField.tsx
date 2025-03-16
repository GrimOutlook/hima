import { Field, Input, Label } from "@headlessui/react";
import { PoolFormErrors, fieldIsValid } from "./PoolFormErrors";
import {
  selectPoolFormData,
  selectPoolFormErrors,
  setPoolFormData,
  setPoolFormErrors,
} from "@/lib/features/poolFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { GradientFocusInput } from "../GradientFocusInput";
import React from "react";

const FIELD = PoolFormErrors.START_DATE;

export const PoolStartDateField = () => {
  const dispatch = useAppDispatch();
  const poolFormData = useAppSelector(selectPoolFormData);
  const errors = useAppSelector(selectPoolFormErrors);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const data = { ...poolFormData, startDate: event.target.value };
    dispatch(setPoolFormData(data));
  };

  const validate = () => {
    /* eslint-disable no-bitwise */
    const newErrors = fieldIsValid(FIELD, poolFormData.startDate)
      ? errors | ~FIELD
      : errors | FIELD;
    /* eslint-enable no-bitwise */

    dispatch(setPoolFormErrors(newErrors));
  };

  // eslint-disable-next-line no-bitwise
  const showError = (errors & FIELD) > 0;

  return (
    <Field className={"mt-2"}>
      <Label className={"text-3xl block"}>Starting on</Label>
      <GradientFocusInput
        invalid={showError}
        className="h-10 w-auto mr-1 inline-block"
        focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
        unfocusedClassName="bg-zinc-300"
      >
        <Input
          name="startDate"
          type="date"
          onFocus={() =>
            // eslint-disable-next-line no-bitwise
            dispatch(setPoolFormErrors(errors & ~FIELD))
          }
          value={poolFormData.startDate}
          onBlur={() => validate()}
          onChange={(event) => handleChange(event)}
          className={showError ? "border-red-500" : ""}
        />
      </GradientFocusInput>
    </Field>
  );
};
