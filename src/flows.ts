import {
  createFlow,
  createOperation,
  deleteFlows,
  deleteOperations,
  readFlows,
  readOperations,
  updateFlow,
  updateOperation,
} from "@directus/sdk";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { client, CONFIG_PATH, ensureConfigDirs } from "./helper";
import _ from "lodash";

/**
 * FlowsManager is a class that handles exporting and importing flows.
 */
export class FlowsManager {
  private flowPath: string = join(CONFIG_PATH, "flows.json");
  private operationPath: string = join(CONFIG_PATH, "operations.json");
  constructor() {}

  setUserNull(record: Record<string, any>) {
    if (record["user_created"]) {
      record["user_created"] = null;
    }
    return record;
  }

  emptyOperations(record: Record<string, any>) {
    if (record["operations"]) {
      record["operations"] = [];
    }
    return record;
  }

  exportFlows = async () => {
    ensureConfigDirs();
    // flows are tied to operations, so we need to fetch all operations
    const operations = await client.request(readOperations());
    writeFileSync(
      this.operationPath,
      JSON.stringify(operations.map(this.setUserNull), null, 2)
    );

    const flows = await client.request(readFlows());
    writeFileSync(
      this.flowPath,
      // empty operations because it is many-to-many relationship; relationship will be created when operations are imported
      JSON.stringify(
        flows.map(this.setUserNull).map(this.emptyOperations),
        null,
        2
      )
    );

    console.log(`Flows exported to ${this.flowPath}`);
    console.log(`Operations exported to ${this.operationPath}`);
  };

  importFlows = async () => {
    await this.handleImportFlows();
    await this.handleImportOperations();
    console.log("Flows and operations imported successfully.");
  };

  private async handleImportFlows() {
    const sourceFlows = JSON.parse(readFileSync(this.flowPath, "utf8"));
    const destinationFlows = await client.request(readFlows());

    for (const flow of sourceFlows) {
      const existingFlow = destinationFlows.find((f) => f.id === flow.id);
      if (existingFlow) {
        if (_.isEqual(existingFlow, flow)) {
          await client.request(updateFlow(flow.id, flow));
        }
      } else {
        await client.request(createFlow(flow));
      }
    }

    const diffFlows = _.differenceBy(destinationFlows, sourceFlows, "id");
    if (diffFlows.length) {
      await client.request(deleteFlows(diffFlows.map((f) => f.id)));
    }
  }

  private async handleImportOperations() {
    // get current user to set as user_created
    const sourceOperations = JSON.parse(
      readFileSync(this.operationPath, "utf8")
    );
    const destinationOperations = await client.request(readOperations());

    for (const operation of sourceOperations) {
      const existingOperation = destinationOperations.find(
        (o) => o.id === operation.id
      );
      if (existingOperation) {
        if (!_.isEqual(existingOperation, operation)) {
          await client.request(updateOperation(operation.id, operation));
        }
      } else {
        await client.request(createOperation(operation));
      }
    }

    const diffOperations = _.differenceBy(
      destinationOperations,
      sourceOperations,
      "id"
    );
    if (diffOperations.length) {
      await client.request(deleteOperations(diffOperations.map((o) => o.id)));
    }
  }
}
