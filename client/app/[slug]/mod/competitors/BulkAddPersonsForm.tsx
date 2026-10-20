"use client";

import { parse } from "csv-parse/browser/esm/sync";
import { useAction } from "next-safe-action/hooks";
import { useContext, useState } from "react";
import useSWR from "swr";
import Form from "~/app/components/form/Form.tsx";
import FormTextArea from "~/app/components/form/FormTextArea.tsx";
import { MainContext } from "~/helpers/contexts.ts";
import { useSession } from "~/helpers/hooks.ts";
import { SwrKey } from "~/helpers/swr-keys.ts";
import { clientGetHasPermission, getActionError } from "~/helpers/utility-functions.ts";
import type { PersonDto } from "~/helpers/validators/Person.ts";
import { bulkCreatePersonsSF } from "~/server/server-functions/person-server-functions.ts";

type Props = {
  onCancel?: () => void;
  onSubmit?: () => void;
};

// CSV columns mapping: region, name, localizedName, wcaId
const expectedColumns = ["region", "name", "localizedName", "wcaId"];

function parsePersonRow(row: Record<string, string>): PersonDto | null {
  const name = row.name?.trim();
  const regionCode = row.region?.trim().toUpperCase();
  if (!name && !regionCode) return null;

  const wcaId = row.wcaId?.trim().toUpperCase() || null;
  return {
    name: name ?? "",
    localizedName: row.localizedName?.trim() || null,
    regionCode: regionCode ?? "",
    wcaId,
  };
}

function BulkAddPersonsForm({ onCancel, onSubmit }: Props) {
  const { session } = useSession();
  const { changeErrorMessages, changeSuccessMessage, resetMessages } = useContext(MainContext);
  const { executeAsync: bulkCreatePersons, isPending } = useAction(bulkCreatePersonsSF);
  const { data: canBulkCreatePersons } = useSWR(
    session?.activeOrganizationId ? [SwrKey.CanBulkCreatePersons, session] : null,
    () => clientGetHasPermission({ persons: ["bulk-create"] }),
  );

  const [csvData, setCsvData] = useState("");

  const parseCsv = (): PersonDto[] => {
    // Try parsing with different delimiters (comma, semicolon, tab)
    let lastError: unknown;
    for (const delimiter of [",", ";", "\t"]) {
      try {
        const parsed = parse<Record<string, string>>(csvData.trim(), {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          relax_column_count: true,
          delimiter,
        });

        if (parsed.length > 0) {
          const header = Object.keys(parsed[0]);
          const hasExpectedColumn = expectedColumns.some((col) => header.includes(col));
          if (!hasExpectedColumn) continue; // wrong delimiter — try the next one

          const persons = parsed.map(parsePersonRow).filter((p): p is PersonDto => p !== null);
          if (persons.length > 0) return persons;
        }
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(
      `Could not parse CSV (${(lastError as Error)?.message ?? "no valid rows"}). ` +
        "Please ensure the first row is a header with the columns: region, name, localizedName, wcaId, " +
        "and that the delimiter is a comma (,), semicolon (;) or tab.",
    );
  };

  const handleSubmit = async () => {
    resetMessages();

    const newPersons = parseCsv();
    const res = await bulkCreatePersons({ newPersons });

    if (res.serverError || res.validationErrors) {
      changeErrorMessages([getActionError(res)]);
    } else {
      changeSuccessMessage(`Successfully added ${newPersons.length} person(s)`);
      setCsvData("");
      onSubmit?.();
    }
  };

  const disabled = !csvData || !canBulkCreatePersons;

  return (
    <Form
      onSubmit={handleSubmit}
      onCancel={onCancel}
      disableControls={disabled}
      isLoading={isPending || !canBulkCreatePersons}
    >
      <p>Instructions</p>
      <p className="text-gray-500 text-sm">
        Enter CSV data below. Supported columns (in any order): region, name, localizedName, wcaId
        <br />
        The first row must be a header with those exact column names.
        <strong> Supported delimiters: comma (,), semicolon (;), or tab.</strong>
        <br />
        Example: <code>region,name,wcaId</code> / <code>US,John Doe,2010DOEJ01</code>
      </p>
      <FormTextArea title="CSV data" value={csvData} setValue={setCsvData} disabled={disabled} rows={10} />
      {!canBulkCreatePersons && <p className="text-danger">You don't have permission to bulk-add persons.</p>}
    </Form>
  );
}

export default BulkAddPersonsForm;
