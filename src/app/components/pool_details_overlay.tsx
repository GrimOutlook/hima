import { Label } from "@headlessui/react"
import { DetailsOverlay } from "./details_overlay"
import { closePoolDetailsOverlay, selectPoolDetailsOverlayOpenState } from "@/lib/features/poolDetailsOverlaySlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";

export const PoolDetailsOverlay = () => {
    const dispatch = useAppDispatch();
    const open = useAppSelector(selectPoolDetailsOverlayOpenState);

    return (
        <DetailsOverlay show={open} onClose={() => dispatch(closePoolDetailsOverlay())}>
            <div className="size-32 bg-red-500"/>
        </DetailsOverlay>
    )
}