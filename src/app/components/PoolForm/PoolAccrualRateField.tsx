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

const FIELD = PoolFormErrors.AMOUNT;

export const PoolAccrualRateField = () => {
  const dispatch = useAppDispatch();
  const poolFormData = useAppSelector(selectPoolFormData);
  const errors = useAppSelector(selectPoolFormErrors);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const num = Number(event.target.value);
    const data = { ...poolFormData, amount: num };
    dispatch(setPoolFormData(data));
  };

  const validate = () => {
    /* eslint-disable no-bitwise */
    const newErrors = fieldIsValid(FIELD, poolFormData.amount)
      ? errors | ~FIELD
      : errors | FIELD;
    /* eslint-enable no-bitwise */

    dispatch(setPoolFormErrors(newErrors));
  };

  // eslint-disable-next-line no-bitwise
  const showError = (errors & FIELD) > 0;

  return (
    <Field className={"inline mr-1"}>
      <Label className={"block text-3xl mt-2"}>Accrual Rate</Label>
      <GradientFocusInput
        invalid={showError}
        className="h-10 w-20 mr-1 inline-block"
        focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
        unfocusedClassName="bg-zinc-300"
      >
        <Input
          name="amount"
          value={poolFormData.amount}
          onBlur={() => validate()}
          onChange={(event) => handleChange(event)}
          onFocus={() =>
            // eslint-disable-next-line no-bitwise
            dispatch(setPoolFormErrors(errors & ~FIELD))
          }
          className={showError ? "border-red-500" : ""}
        />
      </GradientFocusInput>
      <Label>hours</Label>
    </Field>
  );
};
