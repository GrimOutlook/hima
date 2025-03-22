"use client";

import { Fieldset, Legend } from "@headlessui/react";
import React, { useState } from "react";
import { addPool, selectNextPoolID } from "@/lib/features/poolListSlice";
import {
  clearPoolFormData,
  selectPoolFormData,
  selectPoolFormOpenState,
  setPoolFormOpenState,
} from "@/lib/features/poolFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { OverlayDialog } from "../OverlayDialog";
import { PoolAccrualRateField } from "./PoolAccrualRateField";
import { PoolDescriptionField } from "./PoolDescriptionField";
import { PoolNameField } from "./PoolNameField";
import { PoolPeriodField } from "./PoolPeriodField";
import { PoolStartAmountField } from "./PoolStartAmountField";
import { PoolStartDateField } from "./PoolStartDateField";
import { PoolSubmitButton } from "./PoolSubmitButton";
import { poolFormIsValid } from "./PoolFormErrors";

export type PoolFormFieldProps = {
  submitHasBeenClicked: boolean;
};

type PoolFormProps = {
  className?: string;
};

const PoolForm: React.FC<PoolFormProps> = ({ className }) => {
  const dispatch = useAppDispatch();
  const poolFormOpenState = useAppSelector(selectPoolFormOpenState);
  const poolFormData = useAppSelector(selectPoolFormData);
  const nextPoolId = useAppSelector(selectNextPoolID);
  const [submitHasBeenClicked, setSubmitHasBeenClicked] = useState(false);

  const close = () => {
    dispatch(clearPoolFormData());
    dispatch(setPoolFormOpenState(false));
    setSubmitHasBeenClicked(false);
  };

  const submit = () => {
    setSubmitHasBeenClicked(true);
    if (!poolFormIsValid(poolFormData)) {
      return;
    }

    let data = poolFormData;
    if (data.id <= 0) {
      data = { ...poolFormData, id: nextPoolId };
    }

    dispatch(addPool(data));
    close();
  };

  return (
    <OverlayDialog onClose={close} show={poolFormOpenState}>
      <div className={`${className} bg-zinc-300 h-fit w-fit rounded-lg`}>
        <form>
          <Fieldset className={"p-6"}>
            <Legend className={"text-6xl"}>New PPL Pool</Legend>
            <PoolNameField submitHasBeenClicked={submitHasBeenClicked} />
            <PoolDescriptionField />
            <PoolAccrualRateField submitHasBeenClicked={submitHasBeenClicked} />
            <PoolPeriodField submitHasBeenClicked={submitHasBeenClicked} />
            <PoolStartDateField submitHasBeenClicked={submitHasBeenClicked} />
            <PoolStartAmountField submitHasBeenClicked={submitHasBeenClicked} />
            <PoolSubmitButton onClick={() => submit()} />
          </Fieldset>
        </form>
      </div>
    </OverlayDialog>
  );
};

export default PoolForm;
