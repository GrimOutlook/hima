import { Button, Description, Field, Fieldset, Input, Label, Legend, Listbox, ListboxButton, ListboxOption, ListboxOptions, Select } from "@headlessui/react";
import { useState } from "react";

type PoolFormProps = {
    className?: string;
}

const periods = [
    "Daily",
    "Weekly",
    "Monthly",
    "Yearly"
]

const PoolForm: React.FC<PoolFormProps> = ({className}) => {
    const [selectedPeriod, setSelectedPeriod] = useState(periods[1])

    return (
        <div className="bg-zinc-300 h-fit w-fit rounded-l">
            <form>
                <Fieldset className={"p-10"}>
                    <Legend className={"text-6xl m-5"}>New Pool</Legend>
                    <Field>
                        <Label className={"block text-3xl"}>Pool Name</Label>
                        <Input name="pool_name"/>
                    </Field>
                    <Label className={"block text-3xl mt-2"}>Accrual Rate</Label>
                    <Field className={"inline mr-1"}>
                        <Input className="w-20 rounded-lg border-none bg-black/10 mr-1" name="amount"/>
                        <Label>hours</Label>
                    </Field>
                    <Field className={"inline"}>
                        <Listbox value={selectedPeriod} onChange={setSelectedPeriod}>
                            <ListboxButton>{selectedPeriod}</ListboxButton>
                            <ListboxOptions>
                                {periods.map((period) => (
                                <ListboxOption key={period} value={period} className="data-[focus]:bg-blue-100">
                                    {period}
                                </ListboxOption>
                                ))}
                            </ListboxOptions>
                        </Listbox>
                    </Field>
                    <Field>
                        <Label>Starting on</Label>
                    </Field>
                </Fieldset>
            </form>
        </div>
    );
}

export default PoolForm