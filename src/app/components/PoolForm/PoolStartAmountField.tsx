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

const FIELD = PoolFormErrors.START_AMOUNT;

export const PoolStartAmountField = () => {
  const dispatch = useAppDispatch();
  const poolFormData = useAppSelector(selectPoolFormData);
  const errors = useAppSelector(selectPoolFormErrors);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const num = Number(event.target.value);
    const data = { ...poolFormData, startAmount: num };
    dispatch(setPoolFormData(data));
  };

  const validate = () => {
    /* eslint-disable no-bitwise */
    const newErrors = fieldIsValid(FIELD, poolFormData.startAmount)
      ? errors | ~FIELD
      : errors | FIELD;
    /* eslint-enable no-bitwise */

    dispatch(setPoolFormErrors(newErrors));
  };

  // eslint-disable-next-line no-bitwise
  const showError = (errors & FIELD) > 0;

  return (
    <Field>
      <Label className={"mx-1"}>With</Label>
      <GradientFocusInput
        invalid={showError}
        className="h-10 w-20 mr-1 inline-block"
        focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
        unfocusedClassName="bg-zinc-300"
      >
        <Input
          name="startAmount"
          value={poolFormData.startAmount}
          onBlur={() => validate()}
          onFocus={() =>
            // eslint-disable-next-line no-bitwise
            dispatch(setPoolFormErrors(errors & ~FIELD))
          }
          onChange={(event) => handleChange(event)}
          className={showError ? "border-red-500" : ""}
        />
      </GradientFocusInput>
      <Label>hours</Label>
    </Field>
  );
};
