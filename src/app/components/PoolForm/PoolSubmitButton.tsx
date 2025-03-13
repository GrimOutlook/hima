import { Button, Field } from "@headlessui/react";
import React from "react";

type PoolSubmitButtonProps = {
  onClick: () => void;
};

export const PoolSubmitButton: React.FC<PoolSubmitButtonProps> = ({
  onClick,
}) => (
  <Field className={"mt-4"}>
    <Button
      className={`w-full rounded-lg p-2 text-3xl bg-black/10 text-zinc-700
        hover:cursor-pointer hover:shadow-lg transition duration-150 ease-in-out
        hover:scale-102`}
      onClick={onClick}
    >
      Create
    </Button>
  </Field>
);
