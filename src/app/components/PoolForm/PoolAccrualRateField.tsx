import { Field, Input, Label } from "@headlessui/react";
import { PoolFormErrors, fieldIsInvalid } from "./PoolFormErrors";
import React, { useState } from "react";
import {
  selectPoolFormData,
  setPoolFormData,
} from "@/lib/features/poolFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { GradientFocusInput } from "../GradientFocusInput";
import { PoolFormFieldProps } from ".";

const FIELD = PoolFormErrors.AMOUNT;

export const PoolAccrualRateField: React.FC<PoolFormFieldProps> = ({
  submitHasBeenClicked,
}) => {
  const dispatch = useAppDispatch();
  const poolFormData = useAppSelector(selectPoolFormData);
  const [isInvalid, setIsInvalid] = useState(false);
  const [hasBeenFocused, setHasBeenFocused] = useState(false);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const num = Number(event.target.value);
    const data = { ...poolFormData, amount: num };
    dispatch(setPoolFormData(data));
  };

  const showError =
    (isInvalid && hasBeenFocused) ||
    (submitHasBeenClicked && fieldIsInvalid(FIELD, poolFormData.period));

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
          onBlur={() =>
            setIsInvalid(fieldIsInvalid(FIELD, poolFormData.amount))}
          onChange={(event) => handleChange(event)}
          onFocus={() => {
            setHasBeenFocused(true);
            setIsInvalid(false);
          }}
          className={showError ? "border-red-500" : ""}
        />
      </GradientFocusInput>
      <Label>hours</Label>
    </Field>
  );
};
