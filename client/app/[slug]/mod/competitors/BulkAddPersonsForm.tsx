"use client";

import { parse } from "csv-parse/sync";
import { useContext, useState } from "react";
import Form from "~/app/components/form/Form.tsx";
import FormTextArea from "~/app/components/form/FormTextArea.tsx";
import ToastMessages from "~/app/components/UI/ToastMessages.tsx";
import { getActionError } from "~/helpers/utility-functions.ts";

type Props = {
  onCancel?: () => void;
};

function BulkAddPersonsForm({ onCancel }: Props) {
  const [csvData, setCsvData] = useState("");

  // CSV columns mapping: regionCode, name, localizedName, wcaId
  function parsePersonRow(row: Record<string, string>) {
    return {
      regionCode: row.region ? row.region.trim().toUpperCase() : undefined,
      name: row.name ? row.name.trim() : undefined,
      localizedName: row.localizedName ? row.localizedName.trim() : undefined,
      wcaId: row.wcaId ? row.wcaId.trim() : undefined,
    };
  }

  const handleSubmit = async () => {
    let data: any[];
    let parseError: string | null = null;

    // Try parsing with different delimiters (comma, semicolon, tab)
    for (const delimiter of [",", ";", "\t"]) {
      try {
        const parsed = parse(csvData.trim(), {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          relax_column_count: true,
          relaxed_columns: true,
          delimiter,
        });

        if (Array.isArray(parsed) && parsed.length > 0) {
          data = parsed.map(parsePersonRow).filter((p): p is Record<string, any> => !!p.name || !!p.regionCode);
          return; // Success with this delimiter
        }
      } catch (err: any) {
        parseError = "Could not parse CSV";
      }
    }

    if (parseError || !data) {
      throw new Error(`${parseError} Please ensure the CSV has proper delimiters.`);
    }

    const res = await bulkCreatePersons();

    // Get error message from server response
    let error: string | undefined;

    if (res.serverError) {
      if (res.serverError.data) {
        // Check for validation errors with a map of IDs to messages
        const errData = res.serverError.data as any;

        // Check for generic validation pattern
        if ("map" in errData && typeof errData.map === "function") {
          const errorMessages: string[] = [];

          data.forEach((p, index) => {
            const nameKey = `persons.${index}.name`;
            try {
              const msg = errData.name?.[String(p.regionCode || "")]?.[String(index)]?.message;
              if (msg) errorMessages.push(msg);

              // Also check wcaId validation
              if (p.wcaId && !p.wcaId.match(/^[A-Za-z0-9]{17}$/)) {
                const wkaIdMsg = errData.wcaId?.find((v: any) => v.message?.includes(p.wcaId) || p.wcaId?.endsWith(v));
                if (wkaIdMsg) errorMessages.push(wkaIdMsg);
              }
            } catch (e) {
              // Ignore parsing errors for now
            }
          });

          if (errorMessages.some((m: string) => m !== "")) {
            throw new Error(errorMessages.join(", "));
          } else {
            throw new Error(res.serverError.message || res.validationErrors?.[0].message);
          }
        } else {
          // Generic error message pattern
          throw new Error(res.serverError.message || "Bulk creation failed");
        }
      } else if (res.validationErrors) {
        const validationMessages: string[] = [];

        data.forEach((p, index) => {
          const msg = res.validationErrors.find(
            (v: any) => v.key === `persons.${index}.name` || v.key?.includes(`persons.${index}`),
          );

          if (msg?.message) validationMessages.push(msg.message);

          // Check for wcaId errors specifically
          const wkaIdMsg =
            Array.isArray(res.validationErrors) &&
            res.validationErrors.find((v: any) =>
              v.key === `persons.${index}.wcaId` || v.message?.startsWith(`Person with WCA ID ${p.wcaId}...`) || p.name
                ? "persons."
                : "",
            );

          if (wkaIdMsg?.message) validationMessages.push(wkaIdMsg.message);
        });

        // Catch-all error handling for generic messages
        const messages = Object.values(res.validationErrors).filter(
          (v: any): v is string => typeof v.message === "string" && v.message !== "",
        );

        if (messages.some((m: string) => m !== "")) throw new Error(messages.join(", "));

        error = res.serverError || res.validationErrors?.[0]?.message;
      } else {
        // Catch-all error handling for generic messages
        error = res.serverError || res.validationErrors?.[0]?.message;
      }
    }

    // Use changeErrorMessages from the global context via MainContext hook
    const mainContext = useContext(MainContext);

    if (error) {
      mainContext.changeErrorMessages([
        getActionError({
          data: { message: error },
        }),
      ]);
    } else {
      mainContext.changeSuccessMessage(`Successfully added ${data.length} person(s)`);
    }
  };

  const disabled = !csvData || !canManageMembers;

  return (
    <Form
      onSubmit={handleSubmit}
      onCancel={onCancel}
      hideToasts
      disableControls={disabled}
      isLoading={!canManageMembers}
    >
      <ToastMessages />
      <p>Instructions</p>
      <p className="text-gray-500 text-sm">
        Enter CSV data below. Supported columns (in any order): regionCode, name, localizedName, wcaId
        <br />
        The first row must be a header with those exact column names.
        <strong>Supported delimiters: comma (,), semicolon (;), or tab.</strong>
      </p>
      <FormTextArea title="CSV data" value={csvData} setValue={setCsvData} disabled={disabled} rows={10} />
    </Form>
  );
}

export default BulkAddPersonsForm;
