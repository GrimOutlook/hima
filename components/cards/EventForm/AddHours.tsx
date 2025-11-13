
                  <FieldGroup>
  <Controller
    name="add_date"
    control={form.control}
    render={({ field, fieldState }) => (
      <Field orientation="horizontal" data-invalid={fieldState.invalid}>
        <FieldContent>
          <FieldLabel htmlFor={field.name}>Date Added</FieldLabel>
          <FieldDescription>The date the added hours take effect</FieldDescription>
        </FieldContent>
        <Popover open={addedOpen} onOpenChange={setAddedOpen} modal={true}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              id="date"
              className="w-48 justify-between font-normal"
            >
              {field.value ? field.value.toLocaleDateString() : "Select date"}
              <CalendarIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto overflow-hidden p-0" align="start">
            <Calendar
              mode="single"
              selected={field.value || undefined}
              captionLayout="dropdown"
              onSelect={(date) => {
                form.setValue(field.name, date || null)
              }}
            />
          </PopoverContent>
        </Popover>
        {fieldState.invalid && (
          <FieldError errors={[fieldState.error]} />
        )}
      </Field>
    )} />
</FieldGroup>
