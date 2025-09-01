import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Box,
  Button,
  Grid,
  Typography,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Paper,
  Checkbox,
  FormControlLabel,
  Alert,
  LinearProgress,
  Link,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";

const previewTypes = {
  "image/jpeg": true,
  "image/png": true,
  "image/gif": true,
  "application/pdf": true,
};

function PreviewFile({ file, onDelete }) {
  const [preview, setPreview] = React.useState(null);

  React.useEffect(() => {
    if (file && previewTypes[file.type]) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  return (
    <Paper variant="outlined" sx={{ p: 1, mb: 1, display: "flex", alignItems: "center" }}>
      {previewTypes[file.type] && preview && (
        file.type === "application/pdf" ? (
          <embed src={preview} width={40} height={40} type="application/pdf" />
        ) : (
          <img src={preview} alt={file.name} width={40} height={40} style={{ objectFit: "cover", borderRadius: 4 }} />
        )
      )}
      <Box sx={{ ml: 2, flexGrow: 1 }}>
        <Typography variant="body2">{file.name}</Typography>
        <Typography variant="caption">{(file.size / 1024).toFixed(1)} KB</Typography>
      </Box>
      <IconButton color="error" onClick={() => onDelete(file)}>
        <DeleteIcon />
      </IconButton>
    </Paper>
  );
}

function RenameConfirmDialog({ open, file, onClose, onConfirm }) {
  const [newFileName, setNewFileName] = useState("");

  useEffect(() => {
    if (file) {
      const extMatch = file.name.match(/(\.[\w\d_-]+)$/i);
      const ext = extMatch ? extMatch[1] : "";
      const baseName = file.name.replace(ext, "");
      setNewFileName(`${baseName}_${Date.now()}${ext}`);
    }
  }, [file]);

  if (!file) return null;

  return (
    <Dialog open={open} onClose={() => onClose(false)}>
      <DialogTitle>Filename Conflict</DialogTitle>
      <DialogContent>
        <p>
          A file named "<strong>{file.name}</strong>" already exists with different content.
          <br />
          Please choose a new filename to upload instead:
        </p>
        <input
          type="text"
          value={newFileName}
          onChange={(e) => setNewFileName(e.target.value)}
          style={{ width: "100%", padding: "8px", fontSize: "16px" }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(false)}>Cancel</Button>
        <Button onClick={() => onConfirm(newFileName)} variant="contained">
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function FileUpload() {
  const [files, setFiles] = useState([]);
  const [uploadS3, setUploadS3] = useState(false);
  const [uploadAzure, setUploadAzure] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({});
  const [result, setResult] = useState([]);
  const [error, setError] = useState(null);

  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyError, setVerifyError] = useState(null);

  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [fileToRename, setFileToRename] = useState(null);
  const [continueUploadAfterRename, setContinueUploadAfterRename] = useState(false);

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles((curr) => [...curr, ...selectedFiles]);
    setProgress({});
    setResult([]);
    setError(null);
    setVerifyResult(null);
    setVerifyError(null);
  };

  const removeFile = (targetFile) => {
    setFiles((curr) => curr.filter((file) => file !== targetFile));
    setProgress((curr) => {
      const copy = { ...curr };
      delete copy[targetFile.name];
      return copy;
    });
    setVerifyResult(null);
    setVerifyError(null);
  };

  const renameFile = (file, newName) => {
    return new File([file], newName, { type: file.type });
  };

  const checkFileName = async (filename) => {
    try {
      const res = await axios.post("http://localhost:8000/check-file-name", { filename });
      return res.data;
    } catch (e) {
      console.error("Filename check error:", e);
      return { exists: false, hashes: [] };
    }
  };

  const verifyFileHash = async (file) => {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await axios.post("http://localhost:8000/verify", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data.verified;
    } catch {
      return false;
    }
  };

  const preUploadChecks = async () => {
    for (const file of files) {
      const { exists, hashes } = await checkFileName(file.name);
      if (!exists) continue;

      let matched = false;
      for (const hash of hashes) {
        const verified = await verifyFileHash(file);
        if (verified) {
          matched = true;
          setResult((prev) => [
            ...prev,
            { file_name: file.name, message: "File already present in Cloud and Blockchain. Skipping Upload." },
          ]);
          break;
        }
      }
      if (matched) continue;

      setFileToRename(file);
      setConfirmDialogOpen(true);
      return true;
    }
    return false;
  };

  const handleConfirmRenameClose = (newFileName) => {
    setConfirmDialogOpen(false);
    if (typeof newFileName === "string" && newFileName && fileToRename) {
      const extMatch = fileToRename.name.match(/(\.[\w\d_-]+)$/i);
      const ext = extMatch ? extMatch[1] : "";
      let finalName = newFileName;
      if (!finalName.endsWith(ext)) {
        finalName += ext;
      }
      const renamedFile = renameFile(fileToRename, finalName);

      const newFiles = files.filter((f) => f !== fileToRename);
      newFiles.push(renamedFile);
      setFiles(newFiles);

      setFileToRename(null);
      setContinueUploadAfterRename(true);
    } else {
      setFileToRename(null);
      setUploading(false);
    }
  };

  useEffect(() => {
    if (continueUploadAfterRename) {
      setContinueUploadAfterRename(false);
      handleSubmit();
    }
  }, [continueUploadAfterRename]);

  const handleSubmit = async () => {
    setError(null);
    setResult([]);
    if (files.length === 0) {
      setError("Please select one or more files to upload.");
      return;
    }
    if (!uploadS3 && !uploadAzure) {
      setError("Select at least one storage option.");
      return;
    }

    setUploading(true);

    try {
      const paused = await preUploadChecks();
      if (paused) return;

      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      formData.append("upload_s3", uploadS3);
      formData.append("upload_azure", uploadAzure);

      const response = await axios.post("http://localhost:8000/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent) => {
          let percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setProgress({ total: percentCompleted });
        },
      });

      setResult(response.data || []);
      setFiles([]);
      setProgress({});
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleVerify = async () => {
    if (files.length !== 1) {
      setVerifyError("Please select exactly one file for verification.");
      setVerifyResult(null);
      return;
    }
    const file = files[0];
    setVerifyLoading(true);
    setVerifyError(null);
    setVerifyResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await axios.post("http://localhost:8000/verify", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setVerifyResult(response.data);
    } catch (error) {
      setVerifyError(error.response?.data?.detail || error.message || "Verification failed");
    } finally {
      setVerifyLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 700, mx: "auto", mt: 3 }}>
      <Typography variant="h4" textAlign="center" gutterBottom>Secure Multi-Storage File Upload</Typography>

      <input type="file" onChange={handleFileChange} multiple style={{ display: "block", marginBottom: "1rem" }} />

      {files.length > 0 && (
        <>
          <Typography variant="subtitle1" gutterBottom>Selected files:</Typography>
          <List>
            {files.map((file, idx) => (
              <ListItem key={idx} disableGutters>
                <Box sx={{ width: "100%" }}>
                  <PreviewFile file={file} onDelete={removeFile} />
                  <LinearProgress variant="determinate" value={progress[file.name] || progress.total || 0} sx={{ height: 8, borderRadius: 5, mt: 0.5 }} />
                </Box>
              </ListItem>
            ))}
          </List>
        </>
      )}

      <Grid container spacing={2} sx={{ mt: 2, mb: 2 }}>
        <Grid item xs={12} sm={4}>
          <FormControlLabel control={<Checkbox checked={uploadS3} onChange={(e) => setUploadS3(e.target.checked)} />} label="Upload to AWS S3" />
        </Grid>
        <Grid item xs={12} sm={4}>
          <FormControlLabel control={<Checkbox checked={uploadAzure} onChange={(e) => setUploadAzure(e.target.checked)} />} label="Upload to Azure Blob Storage" />
        </Grid>
      </Grid>

      {error && (<Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>)}

      <Button variant="contained" color="primary" fullWidth onClick={handleSubmit} disabled={uploading || verifyLoading}>
        {uploading ? "Uploading..." : "Upload Files"}
      </Button>

      {result.length > 0 &&
        result.map((fileResult, idx) => {
          const uploadResults = fileResult.upload_results || {};

          return (
            <Box key={idx} sx={{ mt: 3 }}>
              <Typography variant="h5" gutterBottom>Upload Results for {fileResult.file_name}</Typography>

              <Typography variant="subtitle1" sx={{ mt: 2 }}>Storage Uploads:</Typography>
              <List>
                {uploadResults.s3 && <ListItem><ListItemText primary={`AWS S3 URL: ${uploadResults.s3}`} /></ListItem>}
                {uploadResults.s3_error && <ListItem><ListItemText primary={`S3 Error: ${uploadResults.s3_error}`} /></ListItem>}
                {uploadResults.azure && <ListItem><ListItemText primary={`Azure Blob URL: ${uploadResults.azure}`} /></ListItem>}
                {uploadResults.azure_error && <ListItem><ListItemText primary={`Azure Error: ${uploadResults.azure_error}`} /></ListItem>}
              </List>

              <Typography variant="subtitle1" sx={{ mt: 2 }}>Blockchain Transaction Hash:</Typography>
              {fileResult.blockchain_receipt && (
                <Link href={`https://sepolia.etherscan.io/tx/${fileResult.blockchain_receipt}`} target="_blank" rel="noopener noreferrer" underline="hover">
                  {fileResult.blockchain_receipt}
                </Link>
              )}
              {fileResult.message && (<Alert severity="info" sx={{ mt: 1 }}>{fileResult.message}</Alert>)}
            </Box>
          );
        })
      }

      <Box sx={{ mt: 5 }}>
        <Typography variant="h5" gutterBottom>Verify File Hash on Blockchain</Typography>
        <Button variant="outlined" color="secondary" onClick={handleVerify} disabled={files.length !== 1 || verifyLoading || uploading}>
          {verifyLoading ? "Verifying..." : "Verify Selected File"}
        </Button>

        {verifyError && <Alert severity="error" sx={{ mt: 2 }}>{verifyError}</Alert>}

        {verifyResult && (
          <Box sx={{ mt: 2 }}>
            {verifyResult.verified ? (
              <Alert severity="success">✔ File hash matches blockchain record!</Alert>
            ) : (
              <Alert severity="warning">✘ File hash does NOT match blockchain record.</Alert>
            )}
            <Typography variant="body2" sx={{ mt: 1 }}><strong>File Hash:</strong> {verifyResult.file_hash}</Typography>
            <Typography variant="body2"><strong>Filename:</strong> {verifyResult.filename}</Typography>
            <Typography variant="body2"><strong>Uploaded By:</strong> {verifyResult.uploaded_by}</Typography>
            <Typography variant="body2"><strong>Storage:</strong> {Array.isArray(verifyResult.storage) ? verifyResult.storage.join(", ") : verifyResult.storage}</Typography>
            <Typography variant="body2"><strong>Upload Time:</strong> {verifyResult.upload_time ? new Date(verifyResult.upload_time * 1000).toLocaleString() : "N/A"}</Typography>
            <Typography variant="body2">
              <strong>Transaction Hash:</strong>{" "}
              <a href={`https://sepolia.etherscan.io/tx/${verifyResult.txn_hash}`} target="_blank" rel="noopener noreferrer">{verifyResult.txn_hash}</a>
            </Typography>
          </Box>
        )}
      </Box>

      <RenameConfirmDialog open={confirmDialogOpen} file={fileToRename} onClose={handleConfirmRenameClose} onConfirm={(name) => handleConfirmRenameClose(name)} />
    </Box>
  );
}
