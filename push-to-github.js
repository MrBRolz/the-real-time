import git from 'isomorphic-git';
import fs from 'fs';
import path from 'path';
import http from 'isomorphic-git/http/node/index.js';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log("\n=== Git Push to GitHub (No Native Git Needed) ===\n");
  
  const username = await question("Enter your GitHub Username: ");
  if (!username) {
    console.error("Username is required.");
    process.exit(1);
  }

  const token = await question("Enter your GitHub Personal Access Token (PAT): ");
  if (!token) {
    console.error("Personal Access Token is required.");
    process.exit(1);
  }

  const repoName = await question("Enter GitHub Repository Name (e.g. tempotrack): ");
  if (!repoName) {
    console.error("Repository name is required.");
    process.exit(1);
  }

  const dir = process.cwd();
  
  // 1. Initialize local repository if .git doesn't exist
  if (!fs.existsSync(path.join(dir, '.git'))) {
    console.log("Initializing local git repository...");
    await git.init({ fs, dir });
  }

  // 2. Define list of files to commit
  const filesToCommit = [
    'index.html',
    'styles.css',
    'app.js',
    'server.js',
    'package.json',
    'yarn.lock',
    'drizzle.config.js',
    'migrate.js',
    'render.yaml',
    'README.md',
    'db/index.js',
    'db/schema.js'
  ];

  // Also scan drizzle/migrations directory for files to add
  const migrationsDir = path.join(dir, 'drizzle/migrations');
  if (fs.existsSync(migrationsDir)) {
    const getFilesRecursively = (dirPath) => {
      let results = [];
      const list = fs.readdirSync(dirPath);
      list.forEach((file) => {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(getFilesRecursively(fullPath));
        } else {
          results.push(path.relative(dir, fullPath));
        }
      });
      return results;
    };
    try {
      const migrationFiles = getFilesRecursively(migrationsDir);
      filesToCommit.push(...migrationFiles);
    } catch (err) {
      console.warn("Could not read migrations directory:", err.message);
    }
  }

  console.log(`Staging ${filesToCommit.length} files...`);

  // Add files
  for (const file of filesToCommit) {
    if (fs.existsSync(path.join(dir, file))) {
      await git.add({ fs, dir, filepath: file });
      console.log(`  Staged: ${file}`);
    } else {
      console.warn(`  File not found (skipped): ${file}`);
    }
  }

  // 3. Commit files
  console.log("Committing changes...");
  try {
    const sha = await git.commit({
      fs,
      dir,
      author: {
        name: username,
        email: `${username}@users.noreply.github.com`
      },
      message: 'Migrate to Render with Express server and PostgreSQL'
    });
    console.log(`Commit successful! SHA: ${sha}`);
  } catch (err) {
    if (err.code === 'NothingToCommitError') {
      console.log("Nothing to commit, repository is up to date.");
    } else {
      throw err;
    }
  }

  // 4. Set Remote origin
  const repoUrl = `https://github.com/${username}/${repoName}.git`;
  console.log(`Setting remote origin: ${repoUrl}`);
  try {
    await git.addRemote({
      fs,
      dir,
      remote: 'origin',
      url: repoUrl
    });
  } catch (err) {
    if (err.code === 'AlreadyExistsError') {
      // Overwrite the remote URL if it exists
      await git.deleteRemote({ fs, dir, remote: 'origin' });
      await git.addRemote({ fs, dir, remote: 'origin', url: repoUrl });
    } else {
      throw err;
    }
  }

  // 5. Push to GitHub
  console.log(`Pushing to branch 'main' on remote 'origin'...`);
  try {
    await git.push({
      fs,
      http,
      dir,
      remote: 'origin',
      ref: 'refs/heads/main',
      force: true, // Force push to overwrite any boilerplate in the repo
      onAuth: () => ({
        username: username,
        password: token
      })
    });
    console.log("\nSuccess! Code pushed to GitHub successfully!");
    console.log(`You can now deploy this to Render by creating a Blueprint from the repo.`);
  } catch (err) {
    console.error("\nPush failed:", err.message);
  } finally {
    rl.close();
  }
}

main().catch(err => {
  console.error("An error occurred:", err);
  rl.close();
});
