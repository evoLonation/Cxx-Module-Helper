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
  root_dir: string;
  build_script_path: string;
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

  const root_dir = vscode.workspace.workspaceFolders![0].uri.fsPath;
  tool = {
    root_dir: root_dir,
    output_channel: vscode.window.createOutputChannel("C++ Module Helper"),
    refactor_script_path: path.join(root_dir, "build_tools", "refactor.py"),
    build_script_path: path.join(root_dir, "build_tools", "build_ninja.py"),
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
      "cxx-module-helper.compileCurrentFile",
      compileCurrentFile
    ),
    vscode.commands.registerCommand(
      "cxx-module-helper.quickImport",
      quickImport
    ),
    vscode.commands.registerCommand(
      "cxx-module-helper.test",
      test
    ),
    vscode.languages.registerCompletionItemProvider(
      { pattern: "**" },
      completion_provider,
      " "
    )
  );
}

async function test() {
}

// This method is called when your extension is deactivated
export function deactivate() { }

async function createFilesListener(event: vscode.FileCreateEvent) {
  for (const file of event.files) {
    const filename = path.basename(file.path);
    // check if the file is empty
    const is_empty = (await vscode.workspace.fs.stat(file)).size === 0;
    const command_prefix = `python ${getTool().refactor_script_path} ${getTool().root_dir
      }`;
    if (filename.endsWith(".ccm")) {
      const module_name = await vscode.window.showInputBox({
        title: `Press the module provided by ${filename}:`,
      });
      if (module_name) {
        let command = `${command_prefix} add_interface ${file.fsPath} ${module_name}`;
        if (is_empty) {
          command += " --new-file";
        }
        await runCommandInOrder(command);
      }
    } else if (filename.endsWith(".cc")) {
      const module_name = await vscode.window.showInputBox({
        title: `Press the module implemented by ${filename}:`,
      });
      if (module_name) {
        let command = `${command_prefix} add_impl ${file.fsPath} ${module_name}`;
        if (is_empty) {
          command += " --new-file";
        }
        await runCommandInOrder(command);
      }
    }
  }
}

async function renameFilesListener(event: vscode.FileRenameEvent) {
  for (const file of event.files) {
    const command = `python ${getTool().refactor_script_path} ${getTool().root_dir
      } rename ${file.oldUri.fsPath} ${file.newUri.fsPath}`;
    await runCommandInOrder(command);
  }
}

async function deleteFilesListener(event: vscode.FileDeleteEvent) {
  console.log("occurred delete event:", event.files);
  for (const file of event.files) {
    const command = `python ${getTool().refactor_script_path} ${getTool().root_dir
      } delete ${file.fsPath}`;
    await runCommandInOrder(command);
  }
}

class AsyncQueue {
  private queue: Array<{ task: () => Promise<any>; resolve: any; reject: any }>;
  private isProcessing: boolean;
  constructor() {
    this.queue = [];
    this.isProcessing = false;
  }

  async enqueue(task: () => Promise<any>) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const { task, resolve, reject } = this.queue.shift()!;
    try {
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.isProcessing = false;
      this.processQueue();
    }
  }
}

const asyncQueue = new AsyncQueue();

async function runCommandInOrder(command: string, show: boolean = false) {
  return asyncQueue.enqueue(() => runCommand(command, show));
}

async function runCommand(command: string, show: boolean = false) {
  const task = new vscode.Task(
    { type: "shell" },
    vscode.TaskScope.Workspace,
    "My Name",
    "My Extension",
    // 使用 -i 参数开启交互式 shell， 从而可以拿到 .bashrc 中的配置
    new vscode.ShellExecution('zsh', ['-i', '-c', command])
  );
  task.presentationOptions = {
    reveal: show ? vscode.TaskRevealKind.Always : vscode.TaskRevealKind.Silent,
    showReuseMessage: false,
  };
  return new Promise(async (resolve, reject) => {
    const execution = await vscode.tasks.executeTask(task);
    const disposable = vscode.tasks.onDidEndTaskProcess((e) => {
      if (e.execution === execution) {
        disposable.dispose();
        resolve(e.exitCode);
      }
    });
  });
}

async function compileCurrentFile() {
  const file = vscode.window.activeTextEditor!.document.uri.fsPath;
  console.log(`compile file: ${file}, root_dir: ${getTool().root_dir}`);
  const relpath = path.relative(getTool().root_dir, file);
  await runCommand(
    `python ${getTool().build_script_path} --root_dir ${getTool().root_dir}`
  );
  await runCommand(
    `ninja -C ${path.join(getTool().root_dir, "build")} source/${relpath}`,
    true
  );
  await vscode.commands.executeCommand("clangd.restart");
}

let modules: string[] = [];

function getModulesFilePath() {
  return path.join(getTool().root_dir, "build", "modules.txt");
}

async function getModulesFromFile() {
  const modules_file_path = getModulesFilePath();
  try {
    const content = await vscode.workspace.fs.readFile(
      vscode.Uri.file(modules_file_path)
    );
    modules = content
      .toString()
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
  } catch (e) {
    console.error(`Error reading modules file: ${e}`);
    modules = [];
  }
}

export const completion_provider: vscode.CompletionItemProvider = {
  provideCompletionItems: async (
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ) => {
    try {
      const range = new vscode.Range(
        new vscode.Position(position.line, 0),
        position
      );
      const text = document.getText(range);
      console.log(`text: ${text}`);
      if (text.trimEnd().endsWith("import")) {
        await getModulesFromFile();
        const completions = modules.map((module) => {
          const item = new vscode.CompletionItem(
            module,
            vscode.CompletionItemKind.Module
          );
          item.insertText = module + ";";
          return item;
        });
        return completions;
      }
    } catch (e) {
      console.log(`Error setting up request: ${e}`);

      return undefined;
    }
  },
};

async function quickImport() {
  const editor = vscode.window.activeTextEditor!;
  const doc = editor.document;
  // find "export module" or "module" next line
  let line = 0;
  const max_line = 10;
  while (line < max_line) {
    const text = doc.lineAt(line).text;
    if (
      text.trimStart().startsWith("export module ") ||
      text.trimStart().startsWith("module ")
    ) {
      break;
    }
    line++;
  }
  if (line === max_line) {
    console.log("No module declaration found");
    return;
  }
  const position = new vscode.Position(line + 1, 0);
  editor.selection = new vscode.Selection(position, position);
  await editor.edit((edit) => {
    edit.insert(position, `\nimport`);
  });
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);
  // await vscode.commands.executeCommand("editor.action.triggerSuggest");
}
