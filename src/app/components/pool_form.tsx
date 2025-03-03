import { Button, Description, Field, Fieldset, Input, Label, Legend, Listbox, ListboxButton, ListboxOption, ListboxOptions, Select } from "@headlessui/react";
import { useState } from "react";
import { CheckIcon, ChevronDownIcon } from '@heroicons/react/20/solid'
import clsx from 'clsx'

import { EnumToArray, ToTitleCase } from "@/lib/helpers"
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { closePoolDialog } from "@/lib/features/poolDialogSlice";
import Period from "@/lib/models/Period";

type PoolFormProps = {
    className?: string;
}

const periods = EnumToArray(Period).map((str: string) => ToTitleCase(str))

const PoolForm: React.FC<PoolFormProps> = ({className}) => {
    const dispatch = useAppDispatch();
    const [selectedPeriod, setSelectedPeriod] = useState(periods[2])

    return (
        <div className="bg-zinc-300 h-fit w-fit rounded-lg">
            <form>
                <Fieldset className={"p-6"}>
                    <Legend className={"text-6xl"}>New PPL Pool</Legend>
                    <Field>
                        <Label className={"block text-3xl"}>Pool Name</Label>
                        <Input className={"w-50 rounded-lg border-none bg-black/10 p-2"} name="pool_name"/>
                    </Field>
                    <Label className={"block text-3xl mt-2"}>Accrual Rate</Label>
                    <Field className={"inline mr-1"}>
                        <Input className="w-20 rounded-lg border-none bg-black/10 mr-1 p-2" name="amount"/>
                        <Label>hours</Label>
                    </Field>
                    <Field className={"inline"}>
                        <Listbox value={selectedPeriod} onChange={setSelectedPeriod}>
                            <ListboxButton className={"relative w-40 p-2 pr-10 rounded-lg bg-black/10"}>
                                {selectedPeriod}
                                <ChevronDownIcon
                                    className="group pointer-events-none absolute top-2.5 right-2.5 size-4 fill-black/60"
                                    aria-hidden="true"
                                />
                            </ListboxButton>
                            <ListboxOptions anchor="bottom" className={clsx('w-[var(--button-width)] rounded-xl border border-black/10 bg-zinc-300/95 p-1 [--anchor-gap:var(--spacing-1)] focus:outline-none transition duration-100 ease-in data-[leave]:data-[closed]:opacity-0')}>
                                {periods.map((period) => (
                                <ListboxOption key={period} value={period} className="group flex cursor-default items-center gap-2 rounded-lg py-1.5 px-3 select-none data-[focus]:bg-white/10">
                                    <CheckIcon className="invisible size-4 fill-black group-data-[selected]:visible"/>
                                    {period}
                                </ListboxOption>
                                ))}
                            </ListboxOptions>
                        </Listbox>
                    </Field>
                    <Field className={"mt-2"}>
                        <Label className={"text-3xl"}>Starting on</Label>
                        <Input className="rounded-lg bg-black/10 block p-2" type="date"/>
                    </Field>
                    <Field className={"mt-2"}>
                        <Button className={"w-full rounded-lg p-2 text-3xl bg-black/10 text-zinc-700"} onClick={() => {dispatch(closePoolDialog())}}>Create</Button>
                    </Field>
                </Fieldset>
            </form>
        </div>
    );
}

export default PoolForm