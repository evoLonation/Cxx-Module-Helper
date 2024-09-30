// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as path from "path";
import * as yaml from "js-yaml";
import { exec, spawn } from "child_process";
import { promisify } from "util";

interface Tool {
  output_channel: vscode.OutputChannel;
  refactor_script_path: string;
  build_script_path: string;
  root_dir: string;
}

let tool: Tool | undefined = undefined;

function getTool(): Tool {
  return tool!;
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(
    'Congratulations, your extension "Cxx-Module-Helper" is now active!'
  );

  tool = {
    output_channel: vscode.window.createOutputChannel("C++ Module Helper"),
    refactor_script_path: context.asAbsolutePath("build_tools/refactor.py"),
    build_script_path: context.asAbsolutePath("build_tools/build_ninja.py"),
    root_dir: vscode.workspace.workspaceFolders![0].uri.fsPath,
  };

  context.subscriptions.push(
    vscode.workspace.onDidRenameFiles(renameFilesListener),
    vscode.workspace.onDidCreateFiles(createFilesListener),
    vscode.workspace.onDidDeleteFiles(deleteFilesListener),

    vscode.commands.registerCommand("cxx-module-helper.helloWorld", () => {
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      vscode.window.showInformationMessage(
        "Hello World from C++ Module Helper!"
      );
    }),
    vscode.commands.registerCommand(
      "cxx-module-helper.generate-ninja",
      async () => {
        await runCommand(
          `python ${getTool().build_script_path} --root ${getTool().root_dir}`,
          true
        );
      }
    ),
    vscode.commands.registerCommand(
      "cxx-module-helper.build-project",
      async () => {
        await runCommand(
          `python ${getTool().build_script_path} --root ${
            getTool().root_dir
          } build`,
          true
        );
      }
    )
  );
}

async function createFilesListener(event: vscode.FileCreateEvent) {
  for (const file of event.files) {
    const filename = path.basename(file.path);
    const command_prefix = `python ${getTool().refactor_script_path} --root ${
      getTool().root_dir
    }`;
    if (filename.endsWith(".ccm")) {
      const module_name = await vscode.window.showInputBox({
        title: `Press the module provided by ${filename}:`,
      });
      const command = `${command_prefix} add_module ${file.fsPath} ${module_name}`;
      await runCommand(command);
    } else if (filename.endsWith(".cc")) {
      const module_name = await vscode.window.showInputBox({
        title: `Press the module implemented by ${filename}:`,
      });
      const command = `${command_prefix} add_impl ${file.fsPath} ${module_name}`;
      await runCommand(command);
    } else if (
      (await vscode.workspace.fs.stat(file)).type === vscode.FileType.Directory
    ) {
      const selection = await vscode.window.showInformationMessage(
        "是否将新文件添加到资源配置中？",
        { modal: true },
        "同意",
        "拒绝"
      );
      if (selection === "同意") {
        const command = `${command_prefix} add_dir ${file.fsPath}`;
        await runCommand(command);
      }
    }
  }
}

async function renameFilesListener(event: vscode.FileRenameEvent) {
  for (const file of event.files) {
    const command = `python ${getTool().refactor_script_path} --root ${
      getTool().root_dir
    } rename ${file.oldUri.fsPath} ${file.newUri.fsPath}`;
    await runCommand(command);
  }
}

async function deleteFilesListener(event: vscode.FileDeleteEvent) {
  for (const file of event.files) {
    const command = `python ${getTool().refactor_script_path} --root ${
      getTool().root_dir
    } delete ${file.fsPath}`;
    await runCommand(command);
  }
}

// async function runCommand(command: string) {
//   console.log(`execute command: ${command}`);
//   const channel = getTool().output_channel;
//   channel.appendLine(`execute command: ${command}`);
//   const env = { ...process.env };
//   env.Path = "C:\\Users\\ZhengyangZhao\\anaconda3;" + env.Path;
//   return new Promise<void>((resolve, reject) => {
//     exec(
//       command,
//       { shell: "powershell.exe", env: env },
//       (error, stdout, stderr) => {
//         channel.appendLine(`stdout:\n${stdout}`);
//         console.log(`stdout:\n${stdout}`);
//         if (stderr) {
//           channel.appendLine(`stderr:\n${stderr}`);
//           console.log(`stderr:\n${stderr}`);
//         }
//         if (error) {
//           const msg = `执行错误: code ${error.code}`;
//           vscode.window.showErrorMessage(msg);
//           console.log(msg);
//           channel.show();
//         }
//         resolve();
//       }
//     );
//   });
// }

async function runCommand(command: string, show: boolean = false) {
  return new Promise<void>((resolve, reject) => {
    console.log(`execute command: ${command}`);
    const channel = getTool().output_channel;
    if (show) {
      channel.show();
    }
    channel.appendLine(`execute command: ${command}`);
    const env = { ...process.env };
    env.Path = "C:\\Users\\ZhengyangZhao\\anaconda3;" + env.Path;
    const child = spawn(command, { shell: "powershell.exe", env: env });
    let last_received: "stdout" | "stderr" | "none" = "none";
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      if (last_received !== "stdout") {
        last_received = "stdout";
        channel.appendLine("----------------stdout----------------");
      }
      stdout += data;
      channel.append(String(data));
    });
    child.stderr.on("data", (data) => {
      if (last_received !== "stderr") {
        last_received = "stderr";
        channel.appendLine("----------------stderr----------------");
      }
      stderr += data;
      channel.append(String(data));
    });
    child.on("close", (code) => {
      console.log(`command exit, code: ${code}`);
      if (code !== 0) {
        channel.show();
      }
      console.log(`stdout:\n ${stdout}`);
      if (stderr) {
        console.log(`stderr:\n ${stderr}`);
      }
      resolve();
    });
  });
}

// This method is called when your extension is deactivated
export function deactivate() {}
