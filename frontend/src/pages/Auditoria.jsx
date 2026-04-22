import React, { useEffect, useState } from 'react';
import { 
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, 
  Paper, Typography, Box, Chip 
} from '@mui/material';
import { 
  HistoryEdu, Timer, Language, Monitor, 
  QueryStats, CalendarToday 
} from '@mui/icons-material';

const Auditoria = () => {
  const [dados, setDados] = useState([]);

  useEffect(() => {
    fetch('https://api.beckercorp.cloud/audit/permanencia') // Ajuste para sua URL de API
      .then(res => res.json())
      .then(data => setDados(data));
  }, []);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
        <HistoryEdu fontSize="large" color="primary" />
        Auditoria de Permanência Becker Corp
      </Typography>

      <TableContainer component={Paper} sx={{ borderRadius: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}>
        <Table>
          <TableHead sx={{ bgcolor: 'primary.main' }}>
            <TableRow>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}><Monitor size={18} /> IP Cliente</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}><Language size={18} /> Domínio</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}><QueryStats size={18} /> Requisições</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}><Timer size={18} /> Tempo Ativo</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}><CalendarToday size={18} /> Último Acesso</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {dados.map((row, index) => (
              <TableRow key={index} hover>
                <TableCell><Chip label={row.client_ip} variant="outlined" color="info" /></TableCell>
                <TableCell sx={{ fontWeight: 500 }}>{row.dominio}</TableCell>
                <TableCell>{row.total_requisicoes}</TableCell>
                <TableCell>
                  <Typography variant="body2" color="primary" sx={{ fontWeight: 'bold' }}>
                    {row.tempo_total_ativo}
                  </Typography>
                </TableCell>
                <TableCell>{new Date(row.ultimo_acesso).toLocaleString('pt-BR')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default Auditoria;
