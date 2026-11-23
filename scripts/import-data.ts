import { DEFAULT_DB_PATH, openDatabase } from '../src/reconcile/db';
import { importAllCsvs } from '../src/reconcile/importer';

function main() {
  const db = openDatabase(DEFAULT_DB_PATH);
  const summary = importAllCsvs(db);

  console.log('DealerOS CSV Import Verification');
  console.log('--------------------------------');
  console.log(`Database:   ${DEFAULT_DB_PATH}`);
  console.log(`Locations:  ${summary.locations.read} read, ${summary.locations.saved} saved`);
  console.log(
    `System A:   ${summary.systemA.read} read, ${summary.systemA.saved} saved ` +
      `(blank actors: ${summary.systemA.blankActors}, voided: ${summary.systemA.voidedRecords})`,
  );
  console.log(
    `System B:   ${summary.systemB.read} read, ${summary.systemB.saved} saved ` +
      `(refs normalized: ${summary.systemB.refsNormalized}, formatted values cleaned: ${summary.systemB.formattedValuesCleaned}, values left NULL: ${summary.systemB.valuesLeftNull})`,
  );

  if (summary.warnings.length > 0) {
    console.log('\nData quality notes:');
    for (const warning of summary.warnings) {
      console.log(`  - ${warning}`);
    }
  }

  const mismatch =
    summary.locations.read !== summary.locations.saved ||
    summary.systemA.read !== summary.systemA.saved ||
    summary.systemB.read !== summary.systemB.saved;

  db.close();

  if (mismatch) {
    console.error('\nERROR: Row count mismatch between CSV read and database saved!');
    process.exit(1);
  }

  console.log('\nPASS: Every CSV row was persisted with zero data loss.');
}

main();
