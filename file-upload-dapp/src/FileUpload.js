import React, { useState } from "react";
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
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";

const previewTypes = {
  "image/jpeg": true,
  "image/png": true,
  "image/gif": true,
  "application/pdf": true,
};

// Explorer URLs for supported networks
const EXPLORER_BASE_URLS = {
  sepolia: "https://sepolia.etherscan.io/tx/",
  goerli: "https://goerli.etherscan.io/tx/",
  mainnet: "https://etherscan.io/tx/",
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
    <Paper
      variant="outlined"
      sx={{ p: 1, mb: 1, display: "flex", alignItems: "center" }}
    >
      {previewTypes[file.type] && preview && (
        file.type === "application/pdf" ? (
          <embed src={preview} width={40} height={40} type="application/pdf" />
        ) : (
          <img
            src={preview}
            alt={file.name}
            width={40}
            height={40}
            style={{ objectFit: "cover", borderRadius: 4 }}
          />
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

export default function FileUpload() {
  const [files, setFiles] = useState([]);
  const [uploadS3, setUploadS3] = useState(false);
  const [uploadAzure, setUploadAzure] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({}); // progress keyed by file.name or total
  const [result, setResult] = useState([]); // updated to array
  const [error, setError] = useState(null);

  // New state for verification
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyError, setVerifyError] = useState(null);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
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
    setProgress({});

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      formData.append("upload_s3", uploadS3);
      formData.append("upload_azure", uploadAzure);

      const response = await axios.post("http://localhost:8000/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent) => {
          let percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
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
      <Typography variant="h4" textAlign="center" gutterBottom>
        Secure Multi-Storage File Upload
      </Typography>

      <input
        type="file"
        onChange={handleFileChange}
        multiple
        style={{ display: "block", marginBottom: "1rem" }}
      />

      {files.length > 0 && (
        <>
          <Typography variant="subtitle1" gutterBottom>
            Selected files:
          </Typography>
          <List>
            {files.map((file, idx) => (
              <ListItem key={idx} disableGutters>
                <Box sx={{ width: "100%" }}>
                  <PreviewFile file={file} onDelete={removeFile} />
                  <LinearProgress
                    variant="determinate"
                    value={progress[file.name] || progress.total || 0}
                    sx={{ height: 8, borderRadius: 5, mt: 0.5 }}
                  />
                </Box>
              </ListItem>
            ))}
          </List>
        </>
      )}

      <Grid container spacing={2} sx={{ mt: 2, mb: 2 }}>
        <Grid item xs={12} sm={4}>
          <FormControlLabel
            control={
              <Checkbox
                checked={uploadS3}
                onChange={(e) => setUploadS3(e.target.checked)}
              />
            }
            label="Upload to AWS S3"
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <FormControlLabel
            control={
              <Checkbox
                checked={uploadAzure}
                onChange={(e) => setUploadAzure(e.target.checked)}
              />
            }
            label="Upload to Azure Blob Storage"
          />
        </Grid>
      </Grid>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Button
        variant="contained"
        color="primary"
        fullWidth
        onClick={handleSubmit}
        disabled={uploading || verifyLoading}
      >
        {uploading ? "Uploading..." : "Upload Files"}
      </Button>

      {/* Upload Results for multiple files */}
      {result.length > 0 && result.map((fileResult, idx) => (
        <Box key={idx} sx={{ mt: 3 }}>
          <Typography variant="h5" gutterBottom>
            Upload Results for {fileResult.file_name}
          </Typography>

          <Typography variant="subtitle1" sx={{ mt: 2 }}>
            Storage Uploads:
          </Typography>
          <List>
            {fileResult.upload_results.s3 && (
              <ListItem>
                <ListItemText primary={`AWS S3 URL: ${fileResult.upload_results.s3}`} />
              </ListItem>
            )}
            {fileResult.upload_results.s3_error && (
              <ListItem>
                <ListItemText primary={`S3 Error: ${fileResult.upload_results.s3_error}`} />
              </ListItem>
            )}
            {fileResult.upload_results.azure && (
              <ListItem>
                <ListItemText primary={`Azure Blob URL: ${fileResult.upload_results.azure}`} />
              </ListItem>
            )}
            {fileResult.upload_results.azure_error && (
              <ListItem>
                <ListItemText primary={`Azure Error: ${fileResult.upload_results.azure_error}`} />
              </ListItem>
            )}
          </List>

          <Typography variant="subtitle1" sx={{ mt: 2 }}>
            Blockchain Transaction Hashes:
          </Typography>
          <List>
            {fileResult.blockchain_receipts &&
              Object.entries(fileResult.blockchain_receipts).map(([storage, hash]) => (
                <ListItem key={storage}>
                  <ListItemText
                    primary={`${storage.toUpperCase()} Tx Hash:`}
                    secondary={
                      <Link
                        href={`https://sepolia.etherscan.io/tx/${hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        underline="hover"
                      >
                        {hash}
                      </Link>
                    }
                  />
                </ListItem>
              ))}
          </List>
        </Box>
      ))}

      {/* Verify Section */}
      <Box sx={{ mt: 5 }}>
        <Typography variant="h5" gutterBottom>
          Verify File Hash on Blockchain
        </Typography>
        <Button
          variant="outlined"
          color="secondary"
          onClick={handleVerify}
          disabled={files.length !== 1 || verifyLoading || uploading}
        >
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
            <Typography variant="body2" sx={{ mt: 1 }}>
              <strong>File Hash:</strong> {verifyResult.file_hash}
            </Typography>
            <Typography variant="body2">
              <strong>Filename:</strong> {verifyResult.filename}
            </Typography>
            <Typography variant="body2">
              <strong>Uploaded By:</strong> {verifyResult.uploaded_by}
            </Typography>
            <Typography variant="body2">
              <strong>Storage:</strong> {verifyResult.storage}
            </Typography>
            <Typography variant="body2">
              <strong>Upload Time:</strong> {new Date(verifyResult.upload_time).toLocaleString()}
            </Typography>
            <Typography variant="body2">
              <strong>Transaction Hash:</strong>{" "}
              <a
                href={`https://sepolia.etherscan.io/tx/${verifyResult.txn_hash}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {verifyResult.txn_hash}
              </a>
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
