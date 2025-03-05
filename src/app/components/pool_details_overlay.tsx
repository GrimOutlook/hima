import { Label } from "@headlessui/react"

type PoolDetailsOverlayProps = {
    pool: number;
}

export const PoolDetailsOverlay: React.FC<PoolDetailsOverlayProps> = ({pool}) => {

    return (
        <div className="size-96 bg-zinc-100 rounded-lg drop-shadow-lg"/>
    )
}