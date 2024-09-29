// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as path from "path";
import * as yaml from "js-yaml";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(
    'Congratulations, your extension "Cxx-Module-Helper" is now active!'
  );

  context.subscriptions.push(
    vscode.workspace.onDidRenameFiles((event) => {
      renameFilesListener(event);
    }),
    vscode.workspace.onDidCreateFiles((event) => {
      createFilesListener(event);
    }),

    vscode.workspace.onDidChangeTextDocument((event) => {
      console.log(event);
    }),

    vscode.commands.registerCommand("cxx-module-helper.helloWorld", () => {
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      vscode.window.showInformationMessage(
        "Hello World from C++ Module Helper!"
      );
    })
  );
}

async function createFilesListener(event: vscode.FileCreateEvent) {
  for (const file of event.files) {
    
  }
}


async function renameFilesListener(event: vscode.FileRenameEvent) {
  for (const file of event.files) {
    const new_path = file.newUri.path;
    const old_path = file.oldUri.path;
    const old_filename = path.basename(old_path);
    const new_filename = path.basename(new_path);

    const no_move: boolean = path.dirname(old_path) === path.dirname(new_path);

    const old_config_uri = vscode.Uri.joinPath(file.oldUri, "../resource.yml");
    let old_config_str: string;
    try {
      old_config_str = Buffer.from(
        await vscode.workspace.fs.readFile(old_config_uri)
      ).toString("utf-8");
    } catch (e) {
      console.log(`the ${old_config_uri.path} is not exist, do nothing`);
      continue;
    }
    const old_config_content = yaml.load(old_config_str) as any;
    if (no_move) {
      for (const key in old_config_content) {
        const list = old_config_content[key];
        if (!(list instanceof Array)) {
          continue;
        }
        for (let i = 0; i < list.length; i++) {
          if (list[i] === old_filename) {
            list[i] = new_filename;
          }
        }
      }
      await vscode.workspace.fs.writeFile(
        old_config_uri,
        Buffer.from(yaml.dump(old_config_content))
      );
    } else {
      const moved_resources: Record<string, any> = {};
      for (const key in old_config_content) {
        const type = key as string;
        const resources = old_config_content[type];
        if (!(resources instanceof Array)) {
          continue;
        }
        const [moved, kept] = resources.reduce(
          (result, value) => {
            if (value === old_filename) {
              result[0].push(value);
            } else {
              result[1].push(value);
            }
            return result;
          },
          [[], []]
        );
        if (moved.length !== 0) {
          moved_resources[type] = moved;
          old_config_content[type] = kept;
        }
      }
      if (Object.keys(moved_resources).length === 0) {
        console.log(
          `the ${old_config_uri.path} is not include ${old_path}, do nothing`
        );
        continue;
      }
      await vscode.workspace.fs.writeFile(
        old_config_uri,
        Buffer.from(yaml.dump(old_config_content))
      );
      const new_config_uri = vscode.Uri.joinPath(
        file.newUri,
        "../resource.yml"
      );
      let new_config_str: string;
      try {
        new_config_str = Buffer.from(
          await vscode.workspace.fs.readFile(new_config_uri)
        ).toString("utf-8");
      } catch (e) {
        new_config_str = "";
        console.log(
          `the ${new_config_uri.path} is not exist, will create a new one`
        );
      }
      const new_config_content =
        new_config_str === "" ? {} : (yaml.load(new_config_str) as any);
      for (const type in moved_resources) {
        if (type in new_config_content) {
          const resources = new_config_content[type];
          if (!(resources instanceof Array)) {
            vscode.window.showWarningMessage(
              `The value in ${type} key in ${new_config_uri.path} is not a list`
            );
            continue;
          }
          new_config_content[type] = resources.concat(moved_resources[type]);
        } else {
          new_config_content[type] = moved_resources[type];
        }
      }
      await vscode.workspace.fs.writeFile(
        new_config_uri,
        Buffer.from(yaml.dump(new_config_content))
      );
    }
  }
}

// This method is called when your extension is deactivated
export function deactivate() {}
