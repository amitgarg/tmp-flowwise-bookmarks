const vscode = require("vscode");
// const { loadState, saveState } = require("./manage");
const AllFlowsProvider = require("./providers/AllFlowsProvider");
const FlowBookmarksProvider = require("./providers/FlowBookmarksProvider");
const { AppsManager } = require("./AppsManager");
const { getJoinFlowConfig } = require("./utils/FileUtils");
const { FlowType } = require("./utils/Constants");

const BOOKMARKS_STATE_KEY = "acnBookmarksState";
const bookmarkFileName = "multiColorBookmarks.json";
const joinedBookmarksFileName = "joinedBookmarks.json";
const activeBookmarksPath = ".vscode";
const diagramOutputDir = "docs/flows";
const appsFolder = "packages/apps";
let myStatusBarItem;
/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(
    'Congratulations, your extension "appwise-code-navigator" is now active!'
  );

  const myExtension = vscode.extensions.getExtension(
    "DeepakPahawa.flowbookmark"
  );

  // Log some properties of the extension object
  //   console.log(myExtension.packageJSON.contributes);
  // Activate the extension if it's not already activated
  if (!myExtension.isActive) {
    myExtension.activate().then(() => {
      console.log("MCB Extension activated");
    });
  }

  let projectDir = getProjectDir();
  if (!projectDir) {
    vscode.window.showErrorMessage(
      "teams-modular-packages not found in workspace"
    );
    return;
  }
  // create a new status bar item that we can now manage
  myStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    10
  );
  context.subscriptions.push(myStatusBarItem);

  const appsManager = new AppsManager(
    context,
    projectDir,
    bookmarkFileName,
    joinedBookmarksFileName,
    appsFolder,
    activeBookmarksPath,
    diagramOutputDir
  );
  context.subscriptions.push(appsManager);

  const defaultAllFlowsProviderData = {
    joinedFlows: {},
    appName: "None",
    basicFlows: {},
  };
  const allFlowsTreeDataProvider = new AllFlowsProvider(
    defaultAllFlowsProviderData
  );
  const allFlowsTreeView = vscode.window.createTreeView("allFlows", {
    treeDataProvider: allFlowsTreeDataProvider,
  });
  context.subscriptions.push(allFlowsTreeView);

  const flowBookmarksProvider = new FlowBookmarksProvider(
    {},
    projectDir,
    context
  );
  const flowBookmarksTreeView = vscode.window.createTreeView("flowBookmarks", {
    treeDataProvider: flowBookmarksProvider,
  });
  context.subscriptions.push(flowBookmarksTreeView);

  // Whenever switch to a different branch, which might have different bookmarks, it is better to run this command.
  let actionReset = vscode.commands.registerCommand(
    "acn.bookmarks.reset",
    () => {
      appsManager.reset();
      allFlowsTreeDataProvider.setData(defaultAllFlowsProviderData);
      allFlowsTreeDataProvider.refresh();
      flowBookmarksProvider.setData({});
      flowBookmarksProvider.refresh();
      vscode.commands.executeCommand("flowbookmark.clearAll");
      updateStatusBarItem("None");
      let state = context.globalState.get(BOOKMARKS_STATE_KEY) || {};
      state.activeApp = "None";
      context.globalState.update(BOOKMARKS_STATE_KEY, state);
    }
  );
  context.subscriptions.push(actionReset);

  let actionCreateBookmarksForApp = vscode.commands.registerCommand(
    "acn.bookmarks.initializeForApp",
    () => {
      vscode.window
        .showQuickPick(appsManager.getAppsWithoutBookmarks(), {
          placeHolder: "Select an App",
          title: "Create bookmarks related to App",
        })
        .then((appName) => {
          loadBookmarksFromApp(appName, true);
        });
    }
  );
  context.subscriptions.push(actionCreateBookmarksForApp);

  let actionLoadBookmarksForApp = vscode.commands.registerCommand(
    "acn.bookmarks.loadFromApp",
    () => {
      vscode.window
        .showQuickPick(appsManager.getAppsWithBookmarks(), {
          placeHolder: "Select an App",
          title: "Load bookmarks from App",
        })
        .then(loadBookmarksFromApp);
    }
  );
  context.subscriptions.push(actionLoadBookmarksForApp);

  let actionReloadBookmarksForApp = vscode.commands.registerCommand(
    "acn.bookmarks.reloadFlows",
    () => {
      let state = context.globalState.get(BOOKMARKS_STATE_KEY) || {};
      loadBookmarksFromApp(state.activeApp);
    }
  );
  context.subscriptions.push(actionReloadBookmarksForApp);

  const loadBookmarksFromApp = (appName, intialize) => {
    if (appName) {
      let state = context.globalState.get(BOOKMARKS_STATE_KEY) || {};
      const appLoader = appsManager.getAppLoader(appName);
      return vscode.commands
        .executeCommand("flowbookmark.clearAll")
        .then(() => appLoader.loadBookmarks(intialize))
        .then(({ success }) => {
          return vscode.commands
            .executeCommand("flowbookmark.importFromFile")
            .then(() => {
              vscode.window.showInformationMessage(success);
              Promise.all([appLoader.basicFlows, appLoader.joinedFlows]).then(
                ([basicFlows, joinedFlows]) => {
                  let data = {
                    appName: appName,
                    basicFlows,
                    joinedFlows,
                  };
                  allFlowsTreeDataProvider.setData(data);
                  allFlowsTreeDataProvider.refresh();
                  flowBookmarksProvider.setData({});
                  flowBookmarksProvider.refresh();
                }
              );
            })
            .then(() => {
              state.activeApp = appName;
              context.globalState.update(BOOKMARKS_STATE_KEY, state);
              updateStatusBarItem(appName);
            });
        })
        .then(() => {
          vscode.commands.executeCommand("setContext", "appLoaded", !intialize);
        });
    }
  };

  const manageJoinedBookmarksCommand = vscode.commands.registerCommand(
    "acn.bookmarks.manageJoinedBookmarks",
    (flowInfo) => {
      if (flowInfo && flowInfo.flowType === FlowType.JOINED) {
        let state = context.globalState.get(BOOKMARKS_STATE_KEY) || {};
        const appLoader = appsManager.getAppLoader(state.activeApp);
        appLoader.manageJoinedBookmarks();
      } else {
        vscode.window
          .showQuickPick(appsManager.getAppsWithBookmarks(), {
            placeHolder: "Select an App",
            title: "Manage Joined Flows for App",
          })
          .then((appName) => {
            const appLoader = appsManager.getAppLoader(appName);
            appLoader.manageJoinedBookmarks();
          });
      }
    }
  );
  context.subscriptions.push(manageJoinedBookmarksCommand);

  const searchFlowsCommand = vscode.commands.registerCommand(
    "acn.bookmarks.filterFlows",
    () => {
      vscode.window
        .showInputBox({
          placeHolder: "Enter keywords",
          prompt: "Search Flows with keywords",
          value: "",
          ignoreFocusOut: true,
        })
        .then((keywords) => {
          allFlowsTreeDataProvider.setFilter(keywords);
          allFlowsTreeDataProvider.refresh();
          vscode.commands.executeCommand(
            "setContext",
            "allFlows.filter",
            !!keywords
          );
        });
    }
  );
  context.subscriptions.push(searchFlowsCommand);

  const removeFlowsFilterCommand = vscode.commands.registerCommand(
    "acn.bookmarks.removeFlowsFilter",
    () => {
      allFlowsTreeDataProvider.setFilter("");
      allFlowsTreeDataProvider.refresh();
      vscode.commands.executeCommand("setContext", "allFlows.filter", false);
    }
  );
  context.subscriptions.push(removeFlowsFilterCommand);

  const filterBookmarksCommand = vscode.commands.registerCommand(
    "acn.bookmarks.filterBookmarks",
    () => {
      vscode.window
        .showInputBox({
          placeHolder: "Enter keywords",
          prompt: "Search Bookmarks with keywords",
          value: "",
          ignoreFocusOut: true,
        })
        .then((keywords) => {
          flowBookmarksProvider.setFilter(keywords);
          flowBookmarksProvider.refresh();
          vscode.commands.executeCommand(
            "setContext",
            "flowBookmarks.filter",
            !!keywords
          );
        });
    }
  );
  context.subscriptions.push(filterBookmarksCommand);

  const removeBookmarksFilterCommand = vscode.commands.registerCommand(
    "acn.bookmarks.removeBookmarksFilter",
    () => {
      flowBookmarksProvider.setFilter("");
      flowBookmarksProvider.refresh();
      vscode.commands.executeCommand(
        "setContext",
        "flowBookmarks.filter",
        false
      );
    }
  );
  context.subscriptions.push(removeBookmarksFilterCommand);

  const openFileToLineCommand = vscode.commands.registerCommand(
    "acn.bookmarks.openFileToLine",
    (filePath, lineNumber) => {
      if (filePath) {
        let line = parseInt(lineNumber);
        vscode.workspace.openTextDocument(filePath).then((doc) => {
          vscode.window.showTextDocument(doc, {
            selection: new vscode.Range(line - 1, 0, line - 1, 0),
          });
        });
      }
    }
  );
  context.subscriptions.push(openFileToLineCommand);

  let actionSaveActiveBookmarksToAnApp = vscode.commands.registerCommand(
    "acn.bookmarks.saveForApp",
    () => {
      let state = context.globalState.get(BOOKMARKS_STATE_KEY) || {};
      if (state.activeApp) {
        const appLoader = appsManager.getAppLoader(state.activeApp);
        vscode.commands
          .executeCommand("flowbookmark.exportMyBookmarks")
          .then(appLoader.saveBookmarks)
          .then(({ success }) => {
            vscode.window.showInformationMessage(success);
            //removed the need to reload the bookmarks manually
            loadBookmarksFromApp(state.activeApp);
          });
      }
    }
  );
  context.subscriptions.push(actionSaveActiveBookmarksToAnApp);

  const searchFlowsAcrossAppsCommand = vscode.commands.registerCommand(
    "acn.bookmarks.searchFlowsAcross",
    () => {
      vscode.window
        .showInputBox({
          placeHolder: "Enter keywords",
          prompt: "Search Flows Across Appswith keywords",
          value: "",
          ignoreFocusOut: true,
        })
        .then((keywords) => {
          const query = keywords
            .split(" ")
            .map((keyword) => `(${keyword})`)
            .join("|");
          const filesToInclude = `${appsFolder}/**/{${bookmarkFileName},${joinedBookmarksFileName}}`;
          vscode.commands.executeCommand("workbench.action.findInFiles", {
            query,
            filesToInclude,
            matchCase: false,
            isRegex: true,
          });
        });
    }
  );
  context.subscriptions.push(searchFlowsAcrossAppsCommand);

  const openFlowCommand = vscode.commands.registerCommand(
    "acn.bookmarks.openFlow",
    ({ label, app, flowType }) => {
      appsManager
        .resolveFlow(app, label, flowType)
        .then((bookmarks) => {
          return { flowName: label, bookmarks };
        })
        .then((data) => {
          flowBookmarksProvider.setData(data);
          flowBookmarksProvider.refresh();
        });
    }
  );
  context.subscriptions.push(openFlowCommand);

  const createDiagramCommand = vscode.commands.registerCommand(
    "acn.bookmarks.diagram",
    ({ label, flowType, app }) => {
      appsManager.generateDiagram(app, label, flowType).then((path) => {
        if (path) {
          vscode.workspace.openTextDocument(path).then((document) => {
            vscode.window.showTextDocument(document, {
              selection: new vscode.Range(1, 0, 2, 0),
            });
          });
        }
      });
    }
  );
  context.subscriptions.push(createDiagramCommand);

  const copyAppFlowCommand = vscode.commands.registerCommand(
    "acn.bookmarks.copyAppFlow",
    ({ label, flowType, app }) => {
      let textToCopyPromise;
      if (flowType === FlowType.JOINED) {
        textToCopyPromise = appsManager
          .getAppLoader(app)
          .joinedFlows.then((config) => {
            return config[label];
          })
          .then((subflows) => {
            return subflows.map(getJoinFlowConfig).join(",");
          });
      } else {
        textToCopyPromise = Promise.resolve(
          getJoinFlowConfig({ app, flow: label })
        );
      }
      textToCopyPromise.then((textToCopy) => {
        vscode.env.clipboard
          .writeText(textToCopy)
          .then(() => {
            vscode.window.showInformationMessage(
              `Json Snippet copied to clipboard\n\n${textToCopy}`
            );
          })
          .catch((err) => {
            vscode.window.showErrorMessage("Failed to copy text to clipboard:");
          });
      });
    }
  );
  context.subscriptions.push(copyAppFlowCommand);
  let state = context.globalState.get(BOOKMARKS_STATE_KEY) || {};
  if (state.activeApp) {
    loadBookmarksFromApp(state.activeApp);
  } else {
    vscode.commands.executeCommand("flowbookmark.clearAll");
    updateStatusBarItem(state.activeApp || "None");
  }
}

function updateStatusBarItem(appName) {
  myStatusBarItem.text = `Bookmarks: ${appName}`;
  myStatusBarItem.show();
}
function getProjectDir() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders) {
    let project = workspaceFolders.find((folder) =>
      folder.uri.fsPath.endsWith("teams-modular-packages")
    );
    return project.uri.fsPath;
  }
}

// this method is called when your extension is deactivated
function deactivate() {
  console.log("deactivated");
}

// eslint-disable-next-line no-undef
module.exports = {
  activate,
  deactivate,
};
