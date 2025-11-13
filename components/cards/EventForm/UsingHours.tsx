
    <FieldGroup className="gap-4">
      <FieldLegend>Using Dates</FieldLegend>
      <FieldDescription>Dates that you want to use paid leave</FieldDescription>

      {useDatesFieldArray.fields.map((field, index) => {
        const last_using_date_index = useDatesFieldArray.fields.length - 1;
        const last_using_date = useDatesFieldArray.fields[last_using_date_index];
        const pool = field.pool
        const dates = field.dates

        let button_string = "Select Dates"
        if (dates.from) {
          button_string = dates.from.toLocaleDateString()
          if (dates.to && dates.to.toDateString() != dates.from?.toDateString()) {
            button_string += " → " + dates.to.toLocaleDateString()
          }
        }

        return (
          <div key={field.id} className="flex flex-row gap-2">
            <Controller
              name={`use_dates.${index}.dates`}
              control={form.control}
              render={(control) => (
                <Field data-invalid={control.fieldState.invalid}>
                  <Popover open={usingOpen[index]} onOpenChange={(e) => {
                    console.debug(`Setting use_dates.${index}.dates is open: ${e}`)
                    setUsingOpen(usingOpen.map((def, openIndex) => openIndex == index ? e : def))
                  }} >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        id={`use_dates.${index}.dates-button`}
                        className="w-full justify-between font-normal basis-2/3"
                      >
                        {button_string}
                        <CalendarIcon />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto overflow-hidden p-0" align="start" ref={usingOpen[index] ? nextInputRef : undefined}>
                      <Calendar
                        mode="range"
                        selected={{ to: field.dates.to || undefined, from: field.dates.from || undefined }}
                        captionLayout="dropdown"
                        onDayClick={(date) => {
                          if (!date && !field.dates.from && !field.pool && index != 0) {
                            console.debug("Removing empty use_date index: " + index)
                            useDatesFieldArray.remove(index)
                            return
                          }

                          let from, to;
                          if (
                            !field.dates.from
                            // If `to` is set, then reset the `to`
                            // and `from` values, setting the `to`
                            // to the newly selected value.
                            || field.dates.to
                            // // If the user selected a date
                            // // before the `to` date reset the
                            // // just set the `to` date to the newly
                            // // selected date
                            // || (field.dates.from && field.dates.from.getTime() < date.getTime())
                          ) {
                            from = date
                            to = null
                          } else {
                            from = field.dates.from
                            to = date
                          }

                          // Make sure the dates always go from
                          // earliest to latest
                          if (from && to && from.getTime() > to.getTime()) {
                            const temp = from
                            from = to
                            to = temp
                          }
                          console.debug("Updating use_dates index " + index)
                          useDatesFieldArray.update(index, { ...field, dates: { from: from, to: to || null } })

                          if (field.pool && from && index == last_using_date_index) {
                            console.debug("Creating use_dates index " + (index + 1))
                            useDatesFieldArray.append(empty_date_field)
                            // Open the calendar back up. It
                            // closes when making a new field.
                            setUsingOpen(usingOpen.map((def, openIndex) => openIndex == index ? true : def))
                          }
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </Field>
              )
              } />

            < Controller
              name={`use_dates.${index}.pool`}
              control={form.control}
              render={(control) => (
                <Field data-invalid={control.fieldState.invalid}>
                  <Select name={`use_dates.${index}.pool-select`} value={pool || undefined} onValueChange={(pool) => {
                    console.debug("Updating use_dates index " + index)
                    useDatesFieldArray.update(index, { ...field, pool: pool || null })

                    if (pool && field.dates.from && index == last_using_date_index) {
                      console.debug("Creating use_dates index " + (index + 1))
                      useDatesFieldArray.append(empty_date_field)
                    }
                  }} defaultValue="">
                    <SelectTrigger aria-invalid={control.fieldState.invalid} className="w-full basis-1/3">
                      <SelectValue placeholder="Pool" />
                    </SelectTrigger>
                    <SelectContent position="item-aligned">
                      {
                        pool_names.map((pool, idx) =>
                          <SelectItem key={idx} value={pool}>{pool}</SelectItem>
                        )
                      }
                    </SelectContent>
                  </Select>
                </Field>
              )} />
            {index != useDatesFieldArray.fields.length - 1 &&
              <Button variant="outline" size="icon-sm" onClick={() => useDatesFieldArray.remove(index)}>
                <Trash2 />
              </Button>
            }
          </div>
        )
      })}
    </FieldGroup>
</FieldSet>
