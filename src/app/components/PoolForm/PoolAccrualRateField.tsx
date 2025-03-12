import { Field, Input, Label } from "@headlessui/react";
import {
  selectPoolFormDataState,
  selectPoolFormErrorsState,
  setPoolFormData,
  setPoolFormErrors,
} from "@/lib/features/poolFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { GradientFocusInput } from "../GradientFocusInput";
import { PoolFormErrors } from "./PoolFormErrors";
import React from "react";

// eslint-disable-next-line max-lines-per-function
export const PoolAccrualRateField = () => {
  const dispatch = useAppDispatch();
  const poolFormData = useAppSelector(selectPoolFormDataState);
  const errors = useAppSelector(selectPoolFormErrorsState);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const data = { ...poolFormData, amount: event.target.valueAsNumber };
    dispatch(setPoolFormData(data));
  };

  const validate = () => {
    // eslint-disable-next-line init-declarations
    let newErrors;

    if (poolFormData.amount === 0) {
      // eslint-disable-next-line no-bitwise
      newErrors = errors | PoolFormErrors.NAME;
    } else {
      // eslint-disable-next-line no-bitwise
      newErrors = errors | ~PoolFormErrors.NAME;
    }

    dispatch(setPoolFormErrors(newErrors));
  };

  // eslint-disable-next-line no-bitwise
  const isInvalid = (errors & PoolFormErrors.AMOUNT) > 0;

  return (
    <Field className={"inline mr-1"}>
      <Label className={"block text-3xl mt-2"}>Accrual Rate</Label>
      <GradientFocusInput
        invalid={isInvalid}
        className="h-10 w-20 mr-1 inline-block"
        focusClassName="bg-linear-to-tr from-sky-300 to-red-400 shadow-lg"
        unfocusedClassName="bg-zinc-300"
      >
        <Input
          name="amount"
          value={poolFormData.amount}
          onBlur={() => validate()}
          onChange={(event) => handleChange(event)}
          onClick={() =>
            // eslint-disable-next-line no-bitwise
            dispatch(setPoolFormErrors(errors & ~PoolFormErrors.AMOUNT))
          }
          className={isInvalid ? "border-red-500" : ""}
        />
      </GradientFocusInput>
      <Label>hours</Label>
    </Field>
  );
};
