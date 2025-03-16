"use client";

import { Fieldset, Legend } from "@headlessui/react";
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
import React from "react";
import { poolFormIsValid } from "./PoolFormErrors";

type PoolFormProps = {
  className?: string;
};

const PoolForm: React.FC<PoolFormProps> = ({ className }) => {
  const dispatch = useAppDispatch();
  const poolFormOpenState = useAppSelector(selectPoolFormOpenState);
  const poolFormData = useAppSelector(selectPoolFormData);
  const nextPoolId = useAppSelector(selectNextPoolID);

  const close = () => {
    dispatch(clearPoolFormData());
    dispatch(setPoolFormOpenState(false));
  };

  const submit = () => {
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
            <PoolNameField />
            <PoolDescriptionField />
            <PoolAccrualRateField />
            <PoolPeriodField />
            <PoolStartDateField />
            <PoolStartAmountField />
            <PoolSubmitButton onClick={() => submit()} />
          </Fieldset>
        </form>
      </div>
    </OverlayDialog>
  );
};

export default PoolForm;
