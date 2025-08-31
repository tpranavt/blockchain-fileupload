// async function main() {
//   const [deployer] = await ethers.getSigners();

//   console.log("Deploying contracts with account:", deployer.address);

//   const FileStorage = await ethers.getContractFactory("FileStorage");
//   const fileStorage = await FileStorage.deploy();

//   await fileStorage.deployed();

//   console.log("FileStorage deployed to:", fileStorage.address);
// }

// main().catch((error) => {
//   console.error(error);
//   process.exitCode = 1;
// });

// const hre = require("hardhat");

// async function main() {
//   const [deployer] = await hre.ethers.getSigners();

//   console.log("Deploying contracts with account:", deployer.address);

//   const FileStorage = await hre.ethers.getContractFactory("FileStorage");
//   const fileStorage = await FileStorage.deploy();

//   console.log("fileStorage object:", fileStorage);

//   await fileStorage.deployed();

//   console.log("FileStorage deployed to:", fileStorage.address);
// }

// main().catch((error) => {
//   console.error(error);
//   process.exitCode = 1;
// });

const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);

  const FileStorage = await hre.ethers.getContractFactory("FileStorage");
  const fileStorage = await FileStorage.deploy();

  await fileStorage.waitForDeployment();

  console.log("FileStorage deployed to:", fileStorage.target);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});